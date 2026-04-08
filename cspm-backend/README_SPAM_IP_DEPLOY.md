# Deploy riêng endpoint spam-ips

File [`server.js`](./server.js) hiện có route local:

- `GET /api/cloudwatch/spam-ips`

File [`spam-ips-lambda.js`](./spam-ips-lambda.js) tách riêng logic đó thành AWS Lambda để deploy độc lập qua API Gateway.

## 1. Cài AWS SAM CLI

Trên máy cần có:

- AWS CLI đã `aws configure`
- AWS SAM CLI

## 2. Build

Tại thư mục `cspm-backend` chạy:

```powershell
sam build -t template-spam-ips.yaml
```

## 3. Deploy

```powershell
sam deploy --guided --template-file template-spam-ips.yaml
```

Khi SAM hỏi:

- Stack Name: `cspm-spam-ips`
- AWS Region: `ap-southeast-2`
- Confirm changes before deploy: `N`
- Allow SAM CLI IAM role creation: `Y`

## 4. URL sau khi deploy

SAM sẽ output endpoint dạng:

```text
https://<api-id>.execute-api.ap-southeast-2.amazonaws.com/api/cloudwatch/spam-ips
```

## 5. Test

```powershell
curl "https://<api-id>.execute-api.ap-southeast-2.amazonaws.com/api/cloudwatch/spam-ips"
```

Có thể truyền query params:

- `logGroupName`
- `threshold`
- `windowSeconds`
- `limit`

Ví dụ:

```powershell
curl "https://<api-id>.execute-api.ap-southeast-2.amazonaws.com/api/cloudwatch/spam-ips?logGroupName=/aws/lambda/lambda_handler&threshold=5&windowSeconds=3600&limit=200"
```

## 6. Quyền cần có

Lambda được cấp:

- `logs:FilterLogEvents`
- `logs:DescribeLogGroups`

Hiện template để `Resource: *` cho nhanh. Nếu muốn mình có thể siết lại chỉ cho đúng 1 log group.
