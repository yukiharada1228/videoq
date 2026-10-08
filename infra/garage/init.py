"""Configure local Garage CORS after its single-node bucket bootstrap completes."""

import os
import time
from contextlib import closing

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError, EndpointConnectionError


def main() -> None:
    bucket = os.environ["GARAGE_BUCKET"]
    origins = list(dict.fromkeys(
        origin.strip() for origin in os.environ["GARAGE_CORS_ORIGINS"].split(",")
        if origin.strip()
    ))
    if not origins:
        raise ValueError("GARAGE_CORS_ORIGINS must contain at least one origin")

    with closing(boto3.client(
        "s3",
        endpoint_url="http://garage:3900",
        region_name="garage",
        aws_access_key_id=os.environ["GARAGE_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["GARAGE_SECRET_ACCESS_KEY"],
        config=Config(signature_version="s3v4", connect_timeout=3, read_timeout=5,
                      retries={"max_attempts": 0}, s3={"addressing_style": "path"}),
    )) as client:
        # Status can succeed before the automatically created bucket is ready.
        for attempt in range(30):
            try:
                client.head_bucket(Bucket=bucket)
                break
            except (ClientError, EndpointConnectionError):
                if attempt == 29:
                    raise
                time.sleep(2)

        # Reapplying the desired CORS configuration is safe on every startup.
        client.put_bucket_cors(Bucket=bucket, CORSConfiguration={"CORSRules": [{
            "AllowedOrigins": origins,
            "AllowedMethods": ["GET", "HEAD", "PUT"],
            "AllowedHeaders": ["*"],
            "ExposeHeaders": ["ETag", "Content-Length", "Content-Range", "Accept-Ranges"],
            "MaxAgeSeconds": 3600,
        }]})
    print("Garage bucket and browser CORS are ready.")


if __name__ == "__main__":
    main()
