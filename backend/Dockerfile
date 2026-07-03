FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir --disable-pip-version-check --upgrade "setuptools>=82.0.1" \
    && pip install --no-cache-dir --disable-pip-version-check -r requirements.txt

COPY . .

RUN useradd --create-home --shell /usr/sbin/nologin taskbridge \
    && chmod +x /app/docker-entrypoint.sh \
    && chown -R taskbridge:taskbridge /app

USER taskbridge

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/ready', timeout=5)"

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
