from __future__ import absolute_import
from __future__ import division
from __future__ import print_function

from scipy import misc
import sys
import os
import argparse
import numpy as np
import mxnet as mx
import cv2
import sklearn.preprocessing as preprocessing
from easydict import EasyDict as edict


class FaceModel:
  def __init__(self, args):
    self.args = args
    model = edict()

    _vec = args.image_size.split(',')
    assert len(_vec)==2
    image_size = (int(_vec[0]), int(_vec[1]))
    self.image_size = image_size
    _vec = args.model.split(',')
    assert len(_vec)==2
    prefix = _vec[0]
    epoch = int(_vec[1])
    print('loading',prefix, epoch)
    ctx = mx.cpu()
    sym, arg_params, aux_params = mx.model.load_checkpoint(prefix, epoch)
    all_layers = sym.get_internals()
    sym = all_layers['fc1_output']
    model = mx.mod.Module(symbol=sym, context=ctx, label_names = None)
    model.bind(data_shapes=[('data', (1, 3, image_size[0], image_size[1]))])
    model.set_params(arg_params, aux_params)
    self.model = model

  def embed(self, face_img):
    nimg = cv2.cvtColor(face_img, cv2.COLOR_BGR2RGB)  # (112, 112, 3)
    aligned = np.transpose(nimg, (2,0,1)) # (3, 112, 112)
    input_blob = np.expand_dims(aligned, axis=0) # (1, 3, 112, 112)
    data = mx.nd.array(input_blob)
    db = mx.io.DataBatch(data=(data,))
    self.model.forward(db, is_train=False)
    embedding = self.model.get_outputs()[0].asnumpy() # (1, 512)
    # print(embedding.shape)

    embedding = preprocessing.normalize(embedding).flatten()
    return embedding

