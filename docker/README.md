# build docker
install dependencies and put configuration into docker image

cpu
```bash
docker build -t deepinsight/mms_cpu -f Dockerfile-deepinsight.cpu .
docker run --name mms -p 8080:80 -itd -v <full path to mxnet-r50-model>:/models deepinsight/mms_cpu mxnet-model-server start --mms-config /models/mms_app_cpu.conf
```

gpu
```bash
docker build -t deepinsight/mms_gpu -f Dockerfile-deepinsight.gpu .
docker run --name mms -p 8080:80 -itd -v <full path to mxnet-r50-model>:/models deepinsight/mms_gpu mxnet-model-server start --mms-config /models/mms_app_gpu.conf
```
