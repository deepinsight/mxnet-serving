#!/bin/sh

# export mxnet.model to serve with mxnet-model-server
rm -f MANIFEST.json
rm -f r50.model
mxnet-model-export --model-name r50 --model-path model-r50-am-lfw
