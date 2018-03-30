# coding: utf-8

import face_embedding
import argparse
import cv2
import time, datetime

parser = argparse.ArgumentParser(description='face model test')
# general
parser.add_argument('--image-size', default='112,112', help='')
parser.add_argument('--image', default='../images/test/1_1_X.jpg', help='path to load image.')
parser.add_argument('--model', default='../model-r50-am-lfw/model,0', help='path to load model.')
parser.add_argument('--ctx', default='cpu,0', type=str, help='context cpu or gpu')
args = parser.parse_args()

if __name__ == '__main__':

    tbegin = time.time()

    model = face_embedding.FaceModel(args)

    tmodel = time.time()

    img = cv2.imread(args.image)
    vec = model.embed(img)
    print(vec)

    tstr = str(datetime.timedelta(seconds=tmodel-tbegin))
    print("load model time: %s" % tstr)

    tend = time.time()
    tstr = str(datetime.timedelta(seconds=tend-tmodel))
    print("preprocessing, embedding and normalization time: %s" % tstr)

    tstr = str(datetime.timedelta(seconds=tend-tbegin))
    print("total time: %s" % tstr)
