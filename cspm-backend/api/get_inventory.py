import json
import logging
import os
import boto3
 


logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['DYNAMODB_TABLE'])
 



def lambda_handler(event, context):
    logger.info("Đang xử lý yêu cầu từ Dashboard...")
    
    # Lấy đường dẫn mà React đang gọi (Path)
    # API Gateway HTTP API dùng 'rawPath', REST API dùng 'path'
    path = event.get('rawPath', event.get('path', ''))

    try:
        response = table.scan()
        items = response.get('Items', [])
        
        # --- TRƯỜNG HỢP 1: REACT HỎI SUMMARY (BIỂU ĐỒ) ---
        if "dashboard-summary" in path:
            passed = len([i for i in items if i.get('severity') == 'Pass'])
            failed = len([i for i in items if i.get('severity') == 'Fail'])
            warning = len([i for i in items if i.get('severity') == 'Warning'])
            total = len(items)
            score = int((passed / total * 100)) if total > 0 else 0
            
            result = {
                "summary": {
                    "security_score": score,
                    "passed": passed,
                    "warning": warning,
                    "failed": failed,
                    "total_assets": total,
                    "total_resources_scanned": total,
                    "unknown": 0,
                    "open_findings": failed + warning,
                    "resolved_findings": 0,
                    "last_updated": items[0].get('timestamp') if items else None
                }
            }

        # --- TRƯỜNG HỢP 2: REACT HỎI FINDINGS (DANH SÁCH LỖI) ---
        else:
            findings_list = []
            for item in items:
                findings_list.append({
                    "id": item.get('finding_id', '1'),
                    "title": item.get('resource_id', 'Unknown'),
                    "rule_name": item.get('rule_name', 'Security Policy'),
                    "service": item.get('service', 'AWS'),
                    "severity": item.get('severity', 'Pass'),
                    "status": "Open",
                    "time": item.get('timestamp', ''),
                    "action": "Remediate"
                })
            # TRẢ VỀ ĐÚNG KEY "findings" MÀ REACT ĐANG ĐỢI
            result = {"findings": findings_list}

        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            'body': json.dumps(result)
        }
        
    except Exception as e:
        logger.error(f"Lỗi: {str(e)}")
        return {'statusCode': 500, 'body': json.dumps({"error": str(e)})}