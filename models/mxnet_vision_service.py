# Copyright 2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.
# Licensed under the Apache License, Version 2.0 (the "License").
# You may not use this file except in compliance with the License.
# A copy of the License is located at
#     http://www.apache.org/licenses/LICENSE-2.0
# or in the "license" file accompanying this file. This file is distributed
# on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
# express or implied. See the License for the specific language governing
# permissions and limitations under the License.

"""`MXNetVisionService` defines a MXNet base vision service
"""

from mms.model_service.mxnet_model_service import MXNetBaseService
from mms.utils.mxnet import image, ndarray
import numpy as np
import sklearn.preprocessing as preprocessing

class MXNetVisionService(MXNetBaseService):
    def _preprocess(self, data):
        img_list = []
        for idx, img in enumerate(data):
            input_shape = self.signature['inputs'][idx]['data_shape']
            # We are assuming input shape is NCHW
            [h, w] = input_shape[2:]
            img_arr = image.read(img)
            img_arr = image.resize(img_arr, w, h)
            img_arr = image.transform_shape(img_arr)
            img_list.append(img_arr)
        return img_list

    def _postprocess(self, data):
        if self.model_name == 'r50' or self.model_name == 'r100':
            return data[0].asnumpy().flatten().tolist()
        if self.model_name == 'age':
            return int(sum(np.argmax(data[0].asnumpy().reshape((100,2)), axis=1)))
        if self.model_name == 'gender':
            return np.argmax(data[0].asnumpy().flatten())
        if self.model_name == 'ga':
            output = data[0].asnumpy()
            gender = np.argmax(output[:,0:2].flatten())
            age = int(sum(np.argmax(output[:,2:202].reshape((100,2)), axis=1)))
            return {'age': age, 'gender': gender}
