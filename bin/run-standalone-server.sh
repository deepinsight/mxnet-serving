#!/bin/sh

# run a standalone mxnet-model-server (flask)
# cd mxnet-r50-model first
mxnet-model-server --models r50=r50.model --service mxnet_vision_service.py --port=8000
