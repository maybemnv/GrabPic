FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 OMP_NUM_THREADS=1 MKL_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 TORCH_HOME=/opt/grabpic/models
WORKDIR /opt/grabpic

COPY requirements.txt .
# Build elsewhere and pull the image on OCI; the 1 GB VM should not compile packages.
RUN pip install --no-cache-dir torch==2.2.2 torchvision==0.17.2 --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r requirements.txt
COPY processor.py server.py ./

# Cache the pinned FaceNet weights in the image so the VM never downloads at request time.
RUN python -c "from facenet_pytorch import InceptionResnetV1; InceptionResnetV1(pretrained='vggface2')" \
    && chmod -R a+rX /opt/grabpic/models

RUN useradd --system --uid 10001 grabpic && mkdir -p /var/lib/grabpic \
    && chown grabpic:grabpic /var/lib/grabpic
USER grabpic
EXPOSE 8000
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
