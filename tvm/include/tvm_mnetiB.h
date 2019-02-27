#ifndef __TVM_MNETI__
#define __TVM_MNETI__
#include "tvm_model.h"

class tvm_mneti: public tvm_model{
public:
    tvm_mneti(std::string path, std::string name, std::string hardware, 
                        int w, int h, bool with_blur=true, int batch=1, int mode=0, int devid=0);
    void detect(cv::Mat& im, std::vector<cv::Rect2f>  & target_boxes,
                             std::vector<cv::Point2f> & target_landmarks,
                             std::vector<float>       & target_scores);
    int width;
    int height;
    void set_threshold(float threshold_){
        threshold = threshold_;
    }
    void set_nms_threshold(float nms_threshold_){
        nms_threshold = nms_threshold_;
    }
private:
    float pixel_means[3] = {0.406, 0.456, 0.485};
    float pixel_stds[3]  = {0.225, 0.224, 0.229};
    float pixel_scale = 255.0;
    bool with_blur_ = true;

    std::map<int, std::vector<cv::Rect2f>> anchors_fpn;
    std::map<int,int>                      num_anchors;

    // const int   rpn_pre_nms_top_n = 1000;
    float nms_threshold = 0.3;
    float threshold = 0.95;

};

#endif