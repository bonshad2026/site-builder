FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --default-timeout=120 --no-cache-dir -r requirements.txt
COPY probe.py .
ENV PYTHONUNBUFFERED=1
ENTRYPOINT ["python", "probe.py"]
