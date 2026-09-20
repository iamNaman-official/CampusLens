# CampusLens AWS deployment

The first Ship It deployment is deliberately small:

```text
Internet -> EC2 reverse proxy -> Django container -> RDS PostgreSQL
                                           |
                                           -> private S3 document bucket
```

The React frontend can be served by the EC2 reverse proxy for the demo. It must
use the Django API URL, never AWS credentials or direct S3 access.

## Local development

The default configuration retains SQLite and `backend/media/`. Keep these
values in `backend/.env`:

```dotenv
DEBUG=True
USE_POSTGRES=False
USE_S3=False
```

## Production configuration

The EC2 container receives values from its host environment or, later, Secrets
Manager. Do not commit a production `.env` file.

```dotenv
DEBUG=False
SECRET_KEY=<long random value>
ALLOWED_HOSTS=<EC2 public DNS or domain>
CORS_ALLOWED_ORIGINS=https://<frontend-host>
CSRF_TRUSTED_ORIGINS=https://<frontend-host>
SECURE_SSL_REDIRECT=True

USE_POSTGRES=True
POSTGRES_DB=campuslens
POSTGRES_USER=campuslens_app
POSTGRES_PASSWORD=<database password>
POSTGRES_HOST=<private RDS endpoint>
POSTGRES_PORT=5432
POSTGRES_SSLMODE=require

USE_S3=True
AWS_REGION=ap-south-1
AWS_S3_REGION_NAME=ap-south-1
AWS_STORAGE_BUCKET_NAME=<globally-unique-private-bucket-name>

AI_MODEL_PROVIDER=bedrock
BEDROCK_REGION=ap-south-1
BEDROCK_MODEL_ID=apac.amazon.nova-lite-v1:0
```

Credentials are intentionally absent. Locally boto3 uses the normal AWS SDK
credential chain. On EC2, attach an instance role with access only to the
CampusLens bucket. When migrating to ECS, replace it with an ECS task role.

## AWS security baseline

- RDS is private and has no public IP.
- The RDS security group accepts TCP 5432 only from the EC2 security group.
- The S3 bucket has Block Public Access enabled, default encryption enabled,
  and no public bucket policy or ACL.
- The EC2 instance role permits `s3:GetObject`, `s3:PutObject`, and
  `s3:DeleteObject` only on `arn:aws:s3:::<bucket>/documents/*`, plus
  `s3:ListBucket` constrained to the `documents/` prefix.
- The EC2 instance role allows `bedrock:InvokeModel` and
  `bedrock:InvokeModelWithResponseStream` only for the selected Bedrock model
  (or its inference profile). The model must be enabled for the account.
- Do not use the root CLI profile to run the application or place AWS keys in
  Docker, source code, `.env.example`, or the frontend.

## Backend image

From the repository root:

```powershell
docker build -f backend/Dockerfile -t campuslens-api backend
```

The startup command runs migrations and `collectstatic`, then starts Gunicorn
on port 8000. Do not expose port 8000 directly to the internet in production;
place HTTPS reverse-proxy software in front of it.
