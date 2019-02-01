#ifndef __FACEALIGN_H__
#define __FACEALIGN_H__

#include <opencv2/imgproc/imgproc.hpp>

class FaceAlign { 
  private:
    std::vector<cv::Point2f> align_src_;
    cv::Size size;
  public:
    FaceAlign();
    cv::Mat Align(const cv::Mat& input, const std::vector<cv::Point2f>& align_dst);
};

#endif