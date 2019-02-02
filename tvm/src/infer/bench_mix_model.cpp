#include "tvm_r100.h"
#include "tvm_mneti.h"
#include <unistd.h>
#include <thread>
#include <sys/time.h>

using namespace cv;
using namespace std;

string path;
string name;
string cpu;
string image;
string video;

static float getElapse(struct timeval *tv1,struct timeval *tv2)
{
    float t = 0.0f;
    if (tv1->tv_sec == tv2->tv_sec)
        t = (tv2->tv_usec - tv1->tv_usec)/1000.0f;
    else
        t = ((tv2->tv_sec - tv1->tv_sec) * 1000 * 1000 + tv2->tv_usec - tv1->tv_usec)/1000.0f;
    return t;
}

int main(int argc, char* argv[]){

    const String keys =
        "{help h usage ?     |                    | print this message }"
        "{path               |/Users/load/code/python/infinivision/tvm-convert/tvm-model | local_id config file }"
        "{cpu                |skylake             | cpu architect family name }"
        "{image              |test.jpg            | image file path }"
        "{video              |/Users/load/video/camera-244-crop-8p.mov                   | video file path }"
    ;

    CommandLineParser parser(argc, argv, keys);
    parser.about("tvm model benchmark");
    if (parser.has("help")) {
        parser.printMessage();
        return 0;
    }

    path = parser.get<String>("path");
    cpu  = parser.get<String>("cpu");
    image  = parser.get<String>("image");
    video  = parser.get<String>("video");
    struct timeval  tv1,tv2;
    Mat ori_img = imread(image);
    Mat img1,img2;
    resize(ori_img,img1,cv::Size(112,112));
    resize(ori_img,img2,cv::Size(120,120));
    tvm_r100  *handle1 = new tvm_r100(path,  "r100",  cpu, 112, 112);
    tvm_mneti *handle2 = new tvm_mneti(path, "mneti", cpu, 120, 120);

    for(int i=0;;i++){
        
        gettimeofday(&tv1,NULL);        
        if(i%2==0){
            Mat roi = img1.clone();
            std::vector<float> features;
            handle1->infer(img1);
            handle1->parse_output(features);
        } else {
            Mat roi = img2.clone();
            std::vector<cv::Rect2f>  boxes;
            std::vector<cv::Point2f> landmarks;
            std::vector<float>       scores;            
            handle2->detect(roi, boxes, landmarks, scores);
        }
        gettimeofday(&tv2,NULL);
        std::cout << "infer once, time eclipsed: " <<  getElapse(&tv1, &tv2) << " ms\n";
    }
}
