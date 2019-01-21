FROM tyrionhuang/mxnet-serving:base

RUN pip install mxnet-model-server \
    && pip uninstall --yes mxnet \
    && pip install --no-cache-dir mxnet-cu80mkl \
    && pip install scipy sklearn \
    && mkdir /mxnet_model_server

COPY mms_app_gpu.conf wsgi.py setup_mms.py mxnet-model-server /mxnet_model_server/

ENV PATH="/mxnet_model_server:${PATH}" MXNET_MODEL_SERVER_GPU_IMAGE=1 gpu_id=0

RUN rm -f /etc/nginx/sites-enabled/default

LABEL maintainer="tyrion.huang@infinivision.io"
