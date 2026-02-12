FROM postgres:17-alpine

# Install python3, pip, bash for AWS CLI and scripting
RUN apk add --no-cache python3 py3-pip bash

# Create virtual environment and install awscli (v1)
RUN python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install awscli

# Add venv to PATH
ENV PATH="/opt/venv/bin:$PATH"

COPY backup.sh /usr/local/bin/backup.sh
COPY entrypoint.sh /usr/local/bin/entrypoint.sh

RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
