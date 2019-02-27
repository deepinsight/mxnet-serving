#include "cpptoml.h"
#include <math.h>
#include <iostream>
#include "tvm_mneti.h"

#define PI 3.14159265

std::vector<float> face_pose_threshold;

int min_width =70;
int min_height=90;
int min_area=5000;
float min_quality=0.66;

extern tvm_mneti * det;

void read_conf(std::string conf){

    try {
        auto g = cpptoml::parse_file(conf);
        auto ssh_threshold     = g->get_qualified_as<double>("detector.threshold").value_or(0.95);
        auto ssh_nms_threshold = g->get_qualified_as<double>("detector.nms_threshold").value_or(0.3);
        det->set_threshold(ssh_threshold);
        det->set_nms_threshold(ssh_nms_threshold);

        min_width  = g->get_qualified_as<int>("detector.min_width").value_or(70);
        min_height = g->get_qualified_as<int>("detector.min_height").value_or(90);
        min_area   = g->get_qualified_as<int>("detector.min_area").value_or(5000);
        min_quality= g->get_qualified_as<double>("detector.min_quality").value_or(0.66);

        auto threshold_array = g->get_qualified_array_of<double>("facePoseType.threshold");
        for (const auto& element : *threshold_array){
            face_pose_threshold.push_back(element);
        }
    }
    catch (const cpptoml::parse_exception& e) {
        std::cerr << "Failed to parse " << conf << ",: " << e.what() << std::endl;
        exit(1);
    }
}

float get_theta(cv::Point2f base, cv::Point2f x, cv::Point2f y) {
    cv::Point2f vx = x-base;
    cv::Point2f vy = y-base;
    vx.y *= -1;
    vy.y *= -1;

    float dx = atan2(vx.y,vx.x) * 180 / PI;
    float dy = atan2(vy.y,vy.x) * 180 / PI;
    float d = dy - dx;

    if(d<-180.0)
        d+=360.0;
    else if (d>180.0)
        d -= 360.0;

    return d; 
}

bool check_large_pose(std::vector<cv::Point2f> & landmark, cv::Rect2f & box, int * pose_type) {
    assert(landmark.size()==5);
    float theta1 = get_theta(landmark[0], landmark[3], landmark[2]);
    float theta2 = get_theta(landmark[1], landmark[2], landmark[4]);
    float theta3 = get_theta(landmark[0], landmark[2], landmark[1]);
    float theta4 = get_theta(landmark[1], landmark[0], landmark[2]);
    float theta5 = get_theta(landmark[3], landmark[4], landmark[2]);
    float theta6 = get_theta(landmark[4], landmark[2], landmark[3]);
    float theta7 = get_theta(landmark[3], landmark[2], landmark[0]);
    float theta8 = get_theta(landmark[4], landmark[1], landmark[2]);

    float left_score = 0.0;
    float right_score = 0.0;
    float up_score = 0.0;
    float down_score = 0.0;

    if(theta1<=0.0)
        left_score = 10.0;
    else if(theta2<=0.0)
        right_score = 10.0;
    else{
        left_score  = theta2/theta1;
        right_score = theta1/theta2;
    }

    if(theta3<=10.0 || theta4<=10.0)
        up_score = 10.0;
    else
        up_score = fmax(theta1/theta3, theta2/theta4);
    
    if(theta5<=10.0 || theta6<=10.0)
        down_score = 10.0;
    else
        down_score = fmax(theta7/theta5, theta8/theta6);
    float mleft = (landmark[0].x+landmark[3].x)/2;
    float mright = (landmark[1].x+landmark[4].x)/2;

    cv::Point2f box_center = (box.br() + box.tl())*0.5;

    int type = 0;
    if(left_score>=face_pose_threshold[0])
        type = 3;
    if(type==0 && left_score>=face_pose_threshold[1])
        if(mright<=box_center.x)
            type = 3;
    if(type==0 && right_score>=face_pose_threshold[0])
        type = 4;
    if(type==0 && right_score>=face_pose_threshold[1])
        if(mleft>=box_center.x)
            type = 4;
    if(type==0 && up_score>=2.0)
        type = 5;
    if(type==0 && down_score>=5.0)
        type = 6;
    if(type==0 && left_score>face_pose_threshold[2])
        type = 1;
    if(type==0 && right_score>face_pose_threshold[2])
        type = 2;
    *pose_type = type;

    if(    left_score >face_pose_threshold[0] 
        || right_score>face_pose_threshold[1]
        || up_score   >face_pose_threshold[2]
        || down_score >face_pose_threshold[3] )
        return false;
    else
        return true;
}
