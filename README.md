# MXNet model serving
MXNet model serving study, with [awslab/mxnet-model-server](https://github.com/awslabs/mxnet-model-server)

### Prerequisites

install Python, mxnet-model-server, docker, jmeter (for stress tests) 

### Inference
`cd inference`

`python inference.py --image=../data/megaage_asian_detected/test/1_1_X.jpg`

### Export mxnet model (.json & .params) to serve (.model)
`mxnet-model-export --model-name r50 --model-path model-r50-am-lfw`

### Run standalone mxnet-model-server (flask)
`cd mxnet-r50-model`

`mxnet-model-server --models r50=r50.model --service mxnet_vision_service.py --port=8080`

### Run production mxnet-model-server (docker + nginx + gunicorn + flask)
WSGI can spawn multiple workers to serve with one GPU each

`docker pull deepinsight/mms_cpu`

`docker run --name mms -p 8080:80 -itd -v <full path to mxnet-r50-model>:/models deepinsight/mms_cpu`

`docker exec mms bash -c "mxnet-model-server.sh start --mms-config /models/mms_app_cpu.conf"`

multi-gpu mode (deepinsight/mms_gpu) will be provided later

### Call mxnet-model-server
`curl -X POST http://127.0.0.1:8080/r50/predict -F "data=@data/megaage_asian_detected/test/1_1_X.jpg"`

### Stress test
`cd stress-test/threads-100-gpu`

`jmeter -n -t test-plan.jmx -e -l log -o output`

### References
https://github.com/awslabs/mxnet-model-server
