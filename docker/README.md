# build docker images
install dependencies and put configuration into docker image

### cpu
```bash
docker build -t deepinsight/mms_cpu -f Dockerfile-deepinsight.cpu .
```

### gpu
```bash
docker build -t deepinsight/mms_gpu -f Dockerfile-deepinsight.gpu .
```

### run built docker images
```bash
docker run --name mms -p 8080:80 -itd -v <full_path_to_mxnet-r50-model>:/models deepinsight/mms_cpu mxnet-model-server start --mms-config /models/mms_app_cpu/gpu.conf
```
