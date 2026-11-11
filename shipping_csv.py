#!/usr/bin/env python3
"""
Royal Mail Click & Drop bulk-import exporter.

Turns the open redemption queue into a CSV you upload at
click-drop.royalmail.com to buy and print labels in bulk. No API
credentials, no carrier integration — appropriate at low volume, and it
throws nothing away if you move to an aggregator later.

    ADMIN_TOKEN=... python3 shipping_csv.py                 # all open orders
    ADMIN_TOKEN=... python3 shipping_csv.py --status PLACED # just new ones
    ADMIN_TOKEN=... python3 shipping_csv.py --out today.csv

After uploading and buying labels, record the tracking numbers back into the
system so holders see them:

    ADMIN_TOKEN=... python3 shipping_csv.py --track 42 AB123456789GB
"""
import argparse, csv, json, os, sys, urllib.request

API = os.environ.get('API', 'https://api.amphora.example')
TOKEN = os.environ.get('ADMIN_TOKEN')

# Click & Drop's bulk import columns. Weight in grams; a sealed card in a
# rigid mailer is comfortably under 100g, but weigh one and correct this.
COLUMNS = [
    'Order reference', 'Recipient name', 'Address line 1', 'Address line 2',
    'City', 'Postcode', 'Country', 'Email address',
    'Weight (g)', 'Package size', 'Service', 'Order value', 'Currency',
    'Contents description', 'Quantity', 'Unit value', 'Country of origin',
]

WEIGHT_G = int(os.environ.get('CARD_WEIGHT_G', '90'))
SERVICE_UK = os.environ.get('RM_SERVICE_UK', 'Royal Mail Tracked 48')
SERVICE_INTL = os.environ.get('RM_SERVICE_INTL', 'Royal Mail International Tracked')
DECLARED_VALUE = os.environ.get('DECLARED_VALUE', '25')


def api(path, method='GET', body=None):
    req = urllib.request.Request(API + path, method=method)
    if TOKEN:
        req.add_header('x-admin-token', TOKEN)
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        req.add_header('Content-Type', 'application/json')
    with urllib.request.urlopen(req, data, timeout=20) as r:
        return json.loads(r.read())


def is_uk(country):
    c = (country or '').strip().lower()
    return c in ('uk', 'gb', 'united kingdom', 'great britain', 'england',
                 'scotland', 'wales', 'northern ireland')


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--out', default='clickdrop-import.csv')
    p.add_argument('--status', default=None, help='filter by order status')
    p.add_argument('--track', nargs=2, metavar=('ORDER_ID', 'TRACKING'),
                   help='record a tracking number and mark the order shipped')
    a = p.parse_args()

    if not TOKEN:
        print('ADMIN_TOKEN is not set'); sys.exit(1)

    if a.track:
        oid, tracking = int(a.track[0]), a.track[1]
        res = api('/redeem/fulfil', 'POST', {
            'orderId': oid, 'status': 'SHIPPED',
            'tracking': tracking, 'carrier': 'Royal Mail',
        })
        print(f"order {oid} marked SHIPPED · {tracking}")
        return

    orders = api('/redeem/queue')
    if isinstance(orders, dict):
        orders = orders.get('rows', orders.get('records', []))
    if a.status:
        orders = [o for o in orders if o['status'] == a.status]

    if not orders:
        print('no open orders'); return

    with open(a.out, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(COLUMNS)
        for o in orders:
            uk = is_uk(o['country'])
            w.writerow([
                f"ARTE-{o['id']:04d}",
                o['name'],
                o['line1'],
                o.get('line2') or '',
                o['city'],
                o['postcode'],
                'GB' if uk else o['country'],
                o['email'],
                WEIGHT_G,
                'Large letter',
                SERVICE_UK if uk else SERVICE_INTL,
                DECLARED_VALUE,
                'GBP',
                'Collectable art print card',
                1,
                DECLARED_VALUE,
                'GB',
            ])

    print(f"{len(orders)} order(s) → {a.out}")
    print()
    print('Next:')
    print('  1. Upload at click-drop.royalmail.com → Import orders')
    print('  2. Buy and print the labels')
    print('  3. Record each tracking number:')
    print('     ADMIN_TOKEN=... python3 shipping_csv.py --track <orderId> <tracking>')
    print()
    print('International orders need a customs declaration (CN22). Click & Drop')
    print('generates it from the contents description and value above — check')
    print('those are right for the destination before buying.')


if __name__ == '__main__':
    main()
