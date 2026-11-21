FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv libfontconfig1 && rm -rf /var/lib/apt/lists/*
COPY pdf-requirements.txt /opt/pdf-requirements.txt
RUN python3 -m venv /opt/pdf && /opt/pdf/bin/pip install --no-cache-dir --only-binary=:all: -r /opt/pdf-requirements.txt
ENV SMP_PDF_PYTHON=/opt/pdf/bin/python
WORKDIR /work
