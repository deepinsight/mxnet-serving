#ifndef __FACEPOSE_H__
#define __FACEPOSE_H__

#include <opencv2/opencv.hpp>
#include <vector>
#include <string>

void read_conf(std::string conf);
bool check_large_pose(std::vector<cv::Point2f> & landmark, cv::Rect2f & box, int * pose_type);

#endif