# Django-free SQS worker Lambda (container image).
FROM public.ecr.aws/lambda/python:3.12

COPY pyproject.toml README.md ./
COPY worker_python ./worker_python
COPY handler.py ./

RUN pip install --no-cache-dir .

# Lambda handler: handler.handler
CMD ["handler.handler"]
