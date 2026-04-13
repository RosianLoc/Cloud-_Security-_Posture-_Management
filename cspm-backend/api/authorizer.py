import boto3
import os
from datetime import datetime, timezone

dynamodb = boto3.resource('dynamodb')
BLOCKED_TABLE = os.environ.get('BLOCKED_IPS_TABLE', 'cspm-blocked-ips')

def is_blocked(ip):
    try:
        table = dynamodb.Table(BLOCKED_TABLE)
        resp = table.get_item(Key={"ip": ip})

        item = resp.get("Item")
        if not item:
            return False

        now = int(datetime.now(timezone.utc).timestamp())
        ttl = int(item.get("ttl", 0))  # ← ép kiểu int, tránh Decimal
        
        print(f"IP {ip} - TTL: {ttl}, Now: {now}, Blocked: {ttl > now}")  # ← thêm log

        if ttl < now:
            return False

        return True

    except Exception as e:
        print(f"Error checking blocked IP: {e}")
        return False
    
def lambda_handler(event, context):

    caller_ip = event.get("requestContext", {}).get("http", {}).get("sourceIp", "")
    
    print(f"Authorizer checking IP: {caller_ip}")
    
    if is_blocked(caller_ip):
        print(f"BLOCKED: {caller_ip}")
        return {
            "isAuthorized": False,
        }

    return {
        "isAuthorized": True,
    }
