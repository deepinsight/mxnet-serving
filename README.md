# MXNet model serving
Deploy MXNet model serving, with [awslab/mxnet-model-server](https://github.com/awslabs/mxnet-model-server)

### Dependencies
Python, mxnet, mxnet-model-server, docker, jmeter (for stress tests) 

### Convert mxnet model (.json & .params) to serving model (.model)
```bash
mxnet-model-export --model-name r50 --model-path model-r50-am-lfw
```

### Run standalone mxnet-model-server (flask)
```bash
cd models
mxnet-model-server --models r50=r50.model ga=ga.model --service mxnet_vision_service.py --port=8080
```
### Run production mxnet-model-server (docker + nginx + gunicorn + flask)
```bash
nvidia-docker run --name mms -p 80:8080 -itd -v <full path to mxnet-serving/models>:/models deepinsight/mms_gpu mxnet-model-server start --mms-config /models/mms_app_gpu.conf
```

### Call mxnet-model-server
```bash
curl -X POST http://127.0.0.1/r50/predict -F "data=@models/image.jpg"
```

### Stress test
```bash
cd stress-test/threads-100-gpu
jmeter -n -t test-plan.jmx -e -l log -o output
```

### References
https://github.com/awslabs/mxnet-model-server
