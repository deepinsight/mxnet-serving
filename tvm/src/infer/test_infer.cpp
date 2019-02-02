#include "tvm_r100.h"
#include "tvm_mneti.h"
#include <unistd.h>
#include <thread>
using namespace cv;
using namespace std;

string path;
string name;
string cpu;
string image;
string video;

void f(){
    tvm_model * handle3 = new tvm_r100(path, name, cpu, 112, 112);
    sleep(1);
    delete handle3;
}

int main(int argc, char* argv[]){

    const String keys =
        "{help h usage ?     |                    | print this message }"
        "{path               |/Users/load/code/python/infinivision/tvm-convert/tvm-model | local_id config file }"
        "{name               |r100                | model name }"
        "{cpu                |skylake             | cpu architect family name }"
        "{image              |test.jpg            | image file path }"
        "{video              |/Users/load/video/camera-244-crop-8p.mov                   | video file path }"


    ;
    CommandLineParser parser(argc, argv, keys);
    parser.about("tvm model infer test case");
    if (parser.has("help")) {
        parser.printMessage();
        return 0;
    }

    path = parser.get<String>("path");
    name = parser.get<String>("name");
    cpu  = parser.get<String>("cpu");
    image  = parser.get<String>("image");
    video  = parser.get<String>("video");

    Mat ori_img = imread(image);

    Mat img;

    tvm_r100 *handle,*handle2 = nullptr;
    if( name=="r100" ){
        resize(ori_img,img,cv::Size(112,112));
        handle = new tvm_r100(path, name, cpu, 112, 112);
        handle->infer(img);
        
        std::vector<float> features;
        handle->parse_output(features);
        for(auto feature: features)
            std::cout << feature << ",";
        std::cout << "\n";

        handle2 = new tvm_r100(path, name, cpu, 112, 112);
        std::thread sub_thread(f);

        delete handle;
        delete handle2;
        sub_thread.join();
    } else if (name=="mneti") {
        cv::VideoCapture capture(video);
        cv::Mat frame, frame_r;
        int frame_count = 1;
        capture >> frame;
        if(!frame.data) {
            std::cout<< "read first frame failed!";
            exit(1);
        }
        namedWindow("Frame");
        tvm_mneti * det = new tvm_mneti(path, name, cpu, frame.cols, frame.rows);
        std::cout << "frame resolution: " << frame.cols << "*" << frame.rows << "\n";
        std::vector<cv::Rect2f>  boxes;
        std::vector<cv::Point2f> landmarks;
        std::vector<float>       scores;
        char keyboard = 0;
        bool stop=false;
        while( keyboard != 'q' && keyboard != 27 ){
            keyboard = (char)waitKey( 30 );
            if(stop){
                imshow("Frame", frame_r);
                if(keyboard==32) stop = false;
                continue;
            } else if(keyboard==32){
                stop = true;
                continue;
            }
            capture >> frame;
            if(!frame.data)   break;
            frame_count++;
            det->detect(frame, boxes, landmarks, scores);
            std::cout << "detected one frame, object num "<< boxes.size()<<"\n";
            for(auto & b: boxes)
                cv::rectangle( frame, b, cv::Scalar( 255, 0, 0 ), 2, 1 );
            for(auto & p: landmarks)
                cv::drawMarker(frame, p,  cv::Scalar(0, 255, 0), cv::MARKER_CROSS, 10, 1);
            resize(frame,frame_r,frame.size()/2);
            imshow("Frame", frame_r);
        }
        delete det;
    }
}
