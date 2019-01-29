#ifndef __ANCHORS__
#define __ANCHORS__
#include <vector>
#include <string>
#include <map>
#include <math.h>
#include <cassert>
#include <opencv2/opencv.hpp>

#include <nlohmann/json.hpp>
using json = nlohmann::json;

#include "tensor_utils.h"

void generate_anchors(int base_size, std::vector<float> & ratios, std::vector<int> & scales,
                      std::vector<cv::Rect2f> & anchors){

    cv::Rect2f base_anchor(0,0,base_size,base_size);
    std::vector<cv::Rect2f> anchor_ratios;
    for(auto ratio: ratios){
        float size_ratios = base_anchor.area() / ratio;
        float ws = roundf(sqrt(size_ratios));
        float hs = roundf(ws * ratio);
        
        cv::Point2f center = base_anchor.tl() + 0.5 * cv::Point2f(base_anchor.width-1, base_anchor.height-1);
        cv::Point2f tl = center - 0.5 * cv::Point2f(ws-1, hs-1);
        anchor_ratios.push_back(cv::Rect2f(tl.x,tl.y,ws,hs));

    }

    for(auto scale: scales){
        for(auto anchor_ratio: anchor_ratios){
            float ws = anchor_ratio.width  * scale;
            float hs = anchor_ratio.height * scale;

            cv::Point2f center = anchor_ratio.tl() + 0.5 * cv::Point2f(anchor_ratio.width-1, anchor_ratio.height-1);
            cv::Point2f tl = center - 0.5 * cv::Point2f(ws-1, hs-1);
            anchors.push_back(cv::Rect2f(tl.x,tl.y,ws,hs));
        }
    }

}

const int stride_fpn[3] = {32, 16, 8};

std::string config = "  \
{   \
    \"32\": {\"SCALES\": [32,16], \"BASE_SIZE\": 16, \"RATIOS\": [1], \"ALLOWED_BORDER\": 9999},  \
    \"16\": {\"SCALES\": [8,4],   \"BASE_SIZE\": 16, \"RATIOS\": [1], \"ALLOWED_BORDER\": 9999},  \
    \"8\":  {\"SCALES\": [2,1],   \"BASE_SIZE\": 16, \"RATIOS\": [1], \"ALLOWED_BORDER\": 9999}   \
}   \
";

void generate_anchors_fpn( std::map<int, std::vector<cv::Rect2f>> & anchors_fpn, 
                           std::map<int,int> & num_anchors ) {

    auto json_conf = json::parse(config);
    for(auto stride: stride_fpn){
        std::vector<cv::Rect2f> anchors;
        int base_size = json_conf[std::to_string(stride)]["BASE_SIZE"];
        auto scale_array = json_conf[std::to_string(stride)]["SCALES"];
        std::vector<int> scales;
        scales.resize(scale_array.size());
        for(size_t i = 0; i< scales.size(); i++){
            scales[i] = scale_array[i];
        }
        auto ratio_array = json_conf[std::to_string(stride)]["RATIOS"];
        std::vector<float> ratios;
        ratios.resize(ratio_array.size());
        for(size_t i = 0; i< ratios.size(); i++){
            ratios[i] = ratio_array[i];
        }

        generate_anchors(base_size,ratios,scales,anchors);

        anchors_fpn[stride] = anchors;
        num_anchors[stride] = anchors.size();
    }

}

void anchor_plane(int h, int w, int stride, 
                  std::vector<cv::Rect2f>& anchors, 
                  std::vector<cv::Rect2f>& anchor_plane){
  anchor_plane.clear();
  for(int j = 0; j< h; j++)
      for(int i = 0; i<w; i++)
        for(auto & anchor: anchors){
          cv::Point2f tl = anchor.tl() + cv::Point2f(i*stride,j*stride);
          anchor_plane.push_back(cv::Rect2f(tl.x, tl.y, anchor.width, anchor.height));
        }
}

void clip_pad(std::vector<float> & tensor, int h, int w, std::vector<float> & pad_tensor , int pad_h, int pad_w){
    pad_tensor.clear();
    int loops = tensor.size()/(h*w);
    for(size_t k=0;k<loops;k++)
        for(size_t i=0;i<h;i++)
            for(size_t j=0;j<w;j++)
                if(i<pad_h && j<pad_w)
                    pad_tensor.push_back(tensor[k*(w*h) + i*w + j ]);
}


void clip_boxes(std::vector<cv::Rect2f> & boxes , int h, int w){
    for(auto & box: boxes){
        if(box.x < 0) {
            box.width += box.x;
            box.x =0;
        } else if(box.x>w){
            box.width -= box.x - w;
            box.x = w;
        }
        if(box.y<0) {
            box.height += box.y;
            box.y =0;            
        } else if(box.y>h){
            box.height -= box.y - h;
            box.y = h;
        }
    }
}

void bbox_pred(std::vector<cv::Rect2f> & anchors, std::vector<cv::Rect2f> & boxes, 
               std::vector<float> & box_deltas, int h, int w) {

    std::vector<float> box_deltas2;
    tensor_reshape(box_deltas, box_deltas2, h, w);

    int count = box_deltas2.size() / 4;
    assert(anchors.size() == count );
    boxes.resize(anchors.size());

    for(size_t i=0; i < count; i++){
        cv::Point2f center = anchors[i].tl() + 0.5 * cv::Point2f(anchors[i].width-1, anchors[i].height-1);
        center = center + cv::Point2f(box_deltas2[i*4]* anchors[i].width, box_deltas2[i*4+1]*anchors[i].height);
        boxes[i].width  = anchors[i].width  * exp(box_deltas2[i*4+2]);
        boxes[i].height = anchors[i].height * exp(box_deltas2[i*4+3]);
        boxes[i].x = center.x - 0.5 * (boxes[i].width  -1.0);
        boxes[i].y = center.y - 0.5 * (boxes[i].height -1.0);;
    }

}

void bbox_pred(std::vector<cv::Rect2f> & anchors, std::vector<cv::Rect2f> & boxes,
               std::vector<float> & box_deltas, int H, int W, int c)
{
    std::vector<float> box_deltas2;
    tensor_reshape(box_deltas, box_deltas2, H, W, c);

    int count = box_deltas2.size() / 4;
    assert(anchors.size() == count );
    boxes.resize(anchors.size());

    for(size_t i=0; i < count; i++)
    {
        cv::Point2f center = anchors[i].tl() + 0.5 * cv::Point2f(anchors[i].width-1, anchors[i].height-1);
        center = center + cv::Point2f(box_deltas2[i*4]* anchors[i].width, box_deltas2[i*4+1]*anchors[i].height);
        boxes[i].width  = anchors[i].width  * exp(box_deltas2[i*4+2]);
        boxes[i].height = anchors[i].height * exp(box_deltas2[i*4+3]);
        boxes[i].x = center.x - 0.5 * (boxes[i].width  -1.0);
        boxes[i].y = center.y - 0.5 * (boxes[i].height -1.0);;
    }

}

void bbox_pred_blur(std::vector<cv::Rect2f> & anchors, std::vector<cv::Rect2f> & boxes, std::vector<float> & blur_scores,
               std::vector<float> & box_deltas, int pred_len , int h, int w) {

    std::vector<float> box_deltas2;
    tensor_reshape(box_deltas, box_deltas2, h, w);

    int count = box_deltas2.size() / pred_len;
    assert(anchors.size() == count );
    boxes.resize(anchors.size());

    for(size_t i=0; i < count; i++){
        cv::Point2f center = anchors[i].tl() + 0.5 * cv::Point2f(anchors[i].width-1, anchors[i].height-1);
        center = center + cv::Point2f(box_deltas2[i*pred_len]* anchors[i].width, box_deltas2[i*pred_len+1]*anchors[i].height);
        boxes[i].width  = anchors[i].width  * exp(box_deltas2[i*pred_len+2]);
        boxes[i].height = anchors[i].height * exp(box_deltas2[i*pred_len+3]);
        boxes[i].x = center.x - 0.5 * (boxes[i].width  -1.0);
        boxes[i].y = center.y - 0.5 * (boxes[i].height -1.0);;
    }

    blur_scores.clear();
    for(size_t i=0; i < count; i++){
        blur_scores.push_back(box_deltas2[i*pred_len+4]);
    }
}

void bbox_pred_blur(std::vector<cv::Rect2f> & anchors, std::vector<cv::Rect2f> & boxes, std::vector<float> & blur_scores,
               std::vector<float> & box_deltas, int pred_len , int h, int w, int C) {

    std::vector<float> box_deltas2;
    tensor_reshape(box_deltas, box_deltas2, h, w, C);

    int count = box_deltas2.size() / pred_len;
    assert(anchors.size() == count );
    boxes.resize(anchors.size());

    for(size_t i=0; i < count; i++){
        cv::Point2f center = anchors[i].tl() + 0.5 * cv::Point2f(anchors[i].width-1, anchors[i].height-1);
        center = center + cv::Point2f(box_deltas2[i*pred_len]* anchors[i].width, box_deltas2[i*pred_len+1]*anchors[i].height);
        boxes[i].width  = anchors[i].width  * exp(box_deltas2[i*pred_len+2]);
        boxes[i].height = anchors[i].height * exp(box_deltas2[i*pred_len+3]);
        boxes[i].x = center.x - 0.5 * (boxes[i].width  -1.0);
        boxes[i].y = center.y - 0.5 * (boxes[i].height -1.0);;
    }

    blur_scores.clear();
    for(size_t i=0; i < count; i++){
        blur_scores.push_back(box_deltas2[i*pred_len+4]);
    }
}

void landmark_pred(std::vector<cv::Rect2f> & anchors, std::vector<cv::Point2f> & landmarks, 
                   std::vector<float> & landmark_deltas, int h, int w) {

    std::vector<float> landmark_deltas2;
    tensor_reshape(landmark_deltas, landmark_deltas2, h, w);
    size_t count = landmark_deltas2.size() / 10;
    assert(anchors.size() == count );

    landmarks.resize(count*5);

    for(size_t i=0; i < count; i++){
        cv::Point2f center = anchors[i].tl() + 0.5 * cv::Point2f(anchors[i].width-1, anchors[i].height-1);
        for(size_t j=0; j<5; j++){
            landmarks[i*5+j].x = center.x + anchors[i].width  * landmark_deltas2[i*10+j*2];
            landmarks[i*5+j].y = center.y + anchors[i].height * landmark_deltas2[i*10+j*2+1];
        }
    }
    
}

void landmark_pred(std::vector<cv::Rect2f> & anchors, std::vector<cv::Point2f> & landmarks,
                   std::vector<float> & landmark_deltas, int H, int W, int c)
{
    std::vector<float> landmark_deltas2;
    tensor_reshape(landmark_deltas, landmark_deltas2, H, W, c);
    size_t count = landmark_deltas2.size() / 10;
    assert(anchors.size() == count);

    landmarks.resize(count*5);

    for (size_t i = 0; i < count; i++)
    {
        cv::Point2f center = anchors[i].tl() + 0.5 * cv::Point2f(anchors[i].width - 1, anchors[i].height - 1);
        for (size_t j = 0; j < 5; j++)
        {
            landmarks[i * 5 + j].x = center.x + anchors[i].width  * landmark_deltas2[i * 10 + j * 2];
            landmarks[i * 5 + j].y = center.y + anchors[i].height * landmark_deltas2[i * 10 + j * 2 + 1];
        }
    }

}

void nms(std::vector<float> & scores, std::vector<cv::Rect2f> & boxes,
         std::vector<bool> & keep, float thresh) {
    std::vector<bool> suppressed( scores.size(), false);
    for(int i=0;i<scores.size();i++){
        if(suppressed[i] == true)
            continue;
        keep[i] = true;
        float ix1 = boxes[i].tl().x;
        float iy1 = boxes[i].tl().y;
        float ix2 = boxes[i].br().x;
        float iy2 = boxes[i].br().y;
        float iarea = boxes[i].area();
        for(int j=i+1;j<scores.size();j++){
            if(suppressed[j]==true)
                continue;
            float xx1 = fmax(ix1, boxes[j].tl().x);
            float yy1 = fmax(iy1, boxes[j].tl().y);
            float xx2 = fmin(ix2, boxes[j].br().x);
            float yy2 = fmin(iy2, boxes[j].br().y);
            float w = fmax(0.0, xx2 - xx1 + 1);
            float h = fmax(0.0, yy2 - yy1 + 1);
            float inter = w * h;
            float overlap = inter / (iarea + boxes[j].area() - inter);
            if(overlap > thresh)
                suppressed[j] = true;
        }
    }
}

#endif