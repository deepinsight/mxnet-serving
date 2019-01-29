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
int    model_count;

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
        "{name               |r100                | model name }"
        "{cpu                |skylake             | cpu architect family name }"
        "{image              |test.jpg            | image file path }"
        "{video              |/Users/load/video/camera-244-crop-8p.mov                   | video file path }"
        "{model_count        |2                   | model handle model_count }"
    ;

    CommandLineParser parser(argc, argv, keys);
    parser.about("tvm model benchmark");
    if (parser.has("help")) {
        parser.printMessage();
        return 0;
    }

    path = parser.get<String>("path");
    name = parser.get<String>("name");
    cpu  = parser.get<String>("cpu");
    image  = parser.get<String>("image");
    video  = parser.get<String>("video");
    model_count  = parser.get<int>("model_count");
    struct timeval  tv1,tv2;
    Mat ori_img = imread(image);
    Mat img;
    resize(ori_img,img,cv::Size(112,112));
    tvm_model *handle1,*handle2 = nullptr;
    std::vector<tvm_r100 *> handles;
    for(int i=0;i<model_count;i++){
        handles.push_back(new tvm_r100(path, name, cpu, 112, 112));
    }
    for(int i=0;;i++){
        Mat roi = img.clone();
        json features;
        int index =  i % model_count;
        gettimeofday(&tv1,NULL);
        handles[index]->infer(roi);
        handles[index]->parse_output(features);
        gettimeofday(&tv2,NULL);
        std::cout << "infer once, time eclipsed: " <<  getElapse(&tv1, &tv2) << " ms\n";
    }
}
