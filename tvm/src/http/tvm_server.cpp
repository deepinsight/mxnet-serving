#include <boost/network/protocol/http/server.hpp>
#include <iostream>
#include <boost/range/algorithm/find_if.hpp>

#include <nlohmann/json.hpp>
using json = nlohmann::json;
#include "base64.h"

namespace http = boost::network::http;

#include <opencv2/opencv.hpp>

#include <exception>
#include <thread>
#include <unistd.h>
#include <errno.h>
#include <stdlib.h>
#include <stdio.h>
#ifdef CPU_BINDING
    #include <sys/sysinfo.h>
#endif

struct tvm_svc;
typedef http::server<tvm_svc> server;

#include "tvm_r100.h"
#include "tvm_mneti.h"
#include "tvm_gender.h"
#include "tvm_age.h"

#include "form_data.h"
#include "face_align.h"

#include "face_param.h"

tvm_mneti * det;
tvm_r100  * embeding;
tvm_gender * gender;
tvm_age    * age;

extern int min_width;
extern int min_height;
extern int min_area;

#ifdef BenchMark
#include <sys/time.h>
static float getElapse(struct timeval *tv1,struct timeval *tv2)
{
    float t = 0.0f;
    if (tv1->tv_sec == tv2->tv_sec)
        t = (tv2->tv_usec - tv1->tv_usec)/1000.0f;
    else
        t = ((tv2->tv_sec - tv1->tv_sec) * 1000 * 1000 + tv2->tv_usec - tv1->tv_usec)/1000.0f;
    return t;
}
#endif

class FaceAlign face_align = FaceAlign();

server::response_header headers[]= {{"Connection", "close"},
                                    {"Content-Type", "text/json"},
                                    {"From", "tvm-infer-server"},
                                    {"Content-Length", "0"}};

struct tvm_svc {

    struct content_type {
        template <class Header>
        bool operator()(Header const& header) {
            return boost::iequals(header.name, "Content-Type");
        }
    };

    struct content_length {
        template <class Header>
        bool operator()(Header const& header) {
            return boost::iequals(header.name, "Content-Length");
        }
    };
    inline void make_response(server::connection_ptr & connection){
        result["result_info"] = result_info;
        res_body = result.dump()+"\n";
        headers[3].value = std::to_string(res_body.length());
        connection->set_headers(boost::make_iterator_range(headers, headers + 4));
        connection->write(res_body);
    }
    void operator()(server::request const &request, server::connection_ptr connection) {
        server::string_type remote_addr = source(request);
        /*
        std::cout << "client: " << remote_addr;
        std::cout << "; path: " << request.destination;
        std::cout << "; method: " << request.method;
        std::cout << std::endl;
        for (auto const& header : request.headers) {
            std::cout << "request header: " << header.name << ": " << header.value << std::endl;
        }
        */
        req_body.clear();
        res_body.clear();
        boundary.clear();
        result.clear();
        result = json::object();
        result_info.clear();
        if(request.method != "POST"){
            std::cerr << "request method must be post\n";
            connection->set_status(server::connection::not_supported);
            result_info = "request method must be post";
            make_response(connection);
            return;
        }
        server::request::headers_container_type::iterator found =
                boost::find_if(request.headers, content_type());
        if (found != request.headers.end()) {
            // std::cout << "found content-type header: " << found->name << ": " << found->value << std::endl;
            std::string content_type_str = found->value;
            if(content_type_str.find("multipart/form-data")!=0){
                std::cerr << "content-type is wrong, expected multipart/form-data\n";
                result_info = "content-type is wrong, expected multipart/form-data";           
                connection->set_status(server::connection::bad_request);
                make_response(connection);
                return;
            } else {
                size_t boundary_start = content_type_str.find("boundary=");
                if(boundary_start<0) {
                    std::cerr << "can't find boundary\n";
                    result_info = "can't find boundary";
                    connection->set_status(server::connection::bad_request);
                    make_response(connection);
                    return;                    
                }
                boundary = content_type_str.substr(boundary_start+9,content_type_str.length());
                // std::cout << "boundary=" << boundary << "\n";
            }
        } else {
            std::cerr << "can not found content-type in header\n";
            result_info = "can not found content-type in header";           
            connection->set_status(server::connection::bad_request);
            make_response(connection);
            return;
        }
        int cl = 0;
        found = boost::find_if(request.headers, content_length());
        if(found != request.headers.end())
            cl = atoi(std::string(found->value).c_str());
        else {
            std::cerr << "can not found content-length in header\n";
            result_info = "can not found content-length in header";
            connection->set_status(server::connection::bad_request);
            make_response(connection);
            return;
        }
        assert(cl>0);
        read_chunk(cl, connection);
    }
    void handle_post_read(server::connection::input_range range, 
        boost::system::error_code boost_error, size_t size, 
        server::connection_ptr conn, size_t left2read) {
        #ifdef BenchMark
        struct timeval  tv1,tv2,tv3;
        gettimeofday(&tv1,NULL);
        #endif            
        if(!boost_error) {
            // std::cout << "read size: " << size << std::endl;
            req_body.append(boost::begin(range), size);
            size_t left = left2read - size;
            if(left>0) {
                read_chunk(left, conn);
            } else {
                // std::cout << "FINISHED at " << req_body.size()<< std::endl;
                // std::cout << "req_body length: " << req_body.length() << "\n";
                // std::cout << req_body << "\n";
                // update content-length
                formDataParser fdparser(req_body.data(), req_body.length(), boundary);
                #ifdef BenchMark
                gettimeofday(&tv2,NULL);
                std::cout << "form data parse:" <<  getElapse(&tv1, &tv2) << " ms\n";
                #endif
                if(fdparser.succeeded()){
                    // std::cout << "form data parse success\n" ;
                    /*
                    for(auto & fd: fdparser.fds)  
                        std::cout << "form data, type=" << fd.type << ",name=" 
                                                        << fd.disposition["name"]
                                                        << ",filename="
                                                        << fd.disposition["filename"]
                                                        << ",data length="
                                                        << fd.data.length()
                                                        << "\n";
                    */
                    // face detect align padding recognize
                    result = json::array();
                    for(auto & fd :fdparser.fds)
                        face_prcocess(fd);
                    #ifdef BenchMark
                    gettimeofday(&tv3,NULL);
                    std::cout << "face process:" <<  getElapse(&tv2, &tv3) << " ms\n";
                    #endif
                    conn->set_status(server::connection::ok);
                    res_body = result.dump()+"\n";
                    headers[3].value = std::to_string(res_body.length());
                    conn->set_headers(boost::make_iterator_range(headers, headers + 4));
                    conn->write(res_body);
                    #ifdef BenchMark
                    gettimeofday(&tv2,NULL);
                    std::cout << "write response:" <<  getElapse(&tv3, &tv2) << " ms\n";
                    #endif
                } else {
                    std::cout << "form data parse error: " << fdparser.getErrorMessage() << "\n";
                    result_info = "form data parse error: " + fdparser.getErrorMessage();
                    conn->set_status(server::connection::bad_request);
                    make_response(conn);
                }
            }
        } else {
            std::cout << "boost error: " << boost_error.message() << "\n";
        }
        #ifdef BenchMark
        gettimeofday(&tv2,NULL);
        std::cout << "handle_post_read:" <<  getElapse(&tv1, &tv2) << " ms\n";
        #endif
    }
    void read_chunk(size_t left2read, server::connection_ptr conn) {
        // std::cout << "left2read: " << left2read << std::endl;
        conn->read(
            boost::bind(
                &tvm_svc::handle_post_read,
                this,
                _1, _2, _3, conn, left2read
                )
            );
    }
    void face_prcocess(formData & fd){
        json entry;
        entry["filename"] = fd.disposition["filename"];
        try{
            #ifdef BenchMark
            struct timeval  tv1,tv2;
            gettimeofday(&tv1,NULL);
            #endif
            cv::Mat img = cv::imdecode(cv::Mat(1, fd.data.size(), CV_8UC1, (uchar *) fd.data.data()), CV_LOAD_IMAGE_COLOR);
            std::vector<cv::Rect2f>  boxes;
            std::vector<cv::Point2f> landmarks;
            std::vector<float>       scores;
            // std::cout << "decode image size: " << img.size() << "\n";
            if(img.cols<min_width or img.rows<min_height){                
                entry["state"] = -1;
                entry["error"] = "input image size too small: " + std::to_string(img.cols) + "*" + std::to_string(img.rows);
                result.push_back(entry);
                return;
            }
            cv::Mat re_img,pad_img;
            if(img.rows > img.cols){
                cv::Size re_size(0, det->height);
                re_size.width = int(det->height*(float(img.cols)/img.rows));
                cv::resize(img, re_img, re_size);
                int len = det->width-re_size.width;
                int left = len/2;
                int right= len - left;
                cv::copyMakeBorder( re_img, pad_img, 0, 0, left, right, cv::BORDER_CONSTANT );
            } else {
                cv::Size re_size(det->width, 0);
                re_size.height = int(det->width*(float(img.rows)/img.cols));
                cv::resize(img, re_img, re_size);
                int len = det->height-re_size.height;
                int bottom = len/2;
                int top    = len - bottom;
                cv::copyMakeBorder( re_img, pad_img, top, bottom, 0, 0, cv::BORDER_CONSTANT );
            }
            #ifdef BenchMark
            gettimeofday(&tv2,NULL);
            std::cout << "image decode:         " <<  getElapse(&tv1, &tv2) << " ms\n";
            gettimeofday(&tv1,NULL);
            #endif
            // std::cout << "padding image size: " << pad_img.size() << "\n";
            det->detect(pad_img, boxes, landmarks, scores);
            #ifdef BenchMark
            gettimeofday(&tv2,NULL);
            std::cout << "face detect:          " <<  getElapse(&tv1, &tv2) << " ms\n";
            gettimeofday(&tv1,NULL);
            #endif            
            if(boxes.size()==0){
                entry["state"] = -2;
                entry["error"] = "detect no face";
                result.push_back(entry);
                return;                
            } else if (boxes.size()>1) {
                entry["state"] = -3;
                entry["error"] = "detect more than one face: " + std::to_string(boxes.size());
                result.push_back(entry);
                return;
            }
            auto & box      = boxes[0];
            if(box.area()<min_area){
                entry["state"] = -4;
                entry["error"] =  "face area(" + std::to_string(box.area()) + ") is tool small";
                result.push_back(entry);
                return;  
            }
            int pose_type=0;
            if(!check_large_pose(landmarks, box, &pose_type)){
                entry["state"] = -7;
                entry["error"] =  "face pose skew";
                entry["pose_type"] = pose_type;
                result.push_back(entry);
                return;
            }
            entry["pose_type"] = pose_type;
            cv::Mat aligned_img = face_align.Align(pad_img, landmarks);
            if(aligned_img.empty()){
                entry["state"] = -5;
                entry["error"] =  "failed to find similar transform matrix for face alignment";
                result.push_back(entry);
                return;
            }
            #ifdef BenchMark
            gettimeofday(&tv2,NULL);
            std::cout << "face check and align: " <<  getElapse(&tv1, &tv2) << " ms\n";
            gettimeofday(&tv1,NULL);
            #endif            
            // cv::imwrite("aligned.jpg",aligned_img);
            entry["state"] = 0;
            embeding->infer(aligned_img);
            std::vector<float> features;
            embeding->parse_output(features);
            std::string features_encode = base64_encode((unsigned char* )features.data(), features.size()*sizeof(float) );
            entry["embedding"] = features_encode;
            #ifdef BenchMark
            gettimeofday(&tv2,NULL);
            std::cout << "face embedding:       " <<  getElapse(&tv1, &tv2) << " ms\n";
            gettimeofday(&tv1,NULL);
            #endif              
            gender->infer(aligned_img);
            entry["gender"] = gender->get_gender();
            #ifdef BenchMark
            gettimeofday(&tv2,NULL);
            std::cout << "face gender:          " <<  getElapse(&tv1, &tv2) << " ms\n";
            gettimeofday(&tv1,NULL);
            #endif             
            age->infer(aligned_img);
            entry["age"] = age->get_age();
            #ifdef BenchMark
            gettimeofday(&tv2,NULL);
            std::cout << "face age:             " <<  getElapse(&tv1, &tv2) << " ms\n";
            gettimeofday(&tv1,NULL);
            #endif             
            result.push_back(entry);
        }
        catch(std::exception & e) {
            std::cout << e.what() << "\n";
            entry["state"] = -6;
            entry["error"]  = "opencv exception: ";
            entry["error"] += e.what();
            result.push_back(entry);
        }
    }

private:
    std::string req_body;
    std::string boundary;
    std::string res_body;
    json result;
    std::string result_info;

};

int main(int argc, char *argv[]) {

    const cv::String keys =
        "{help h usage ?     |                    | print this message }"
        "{config             |../conf/face_param.toml       | face param conf file }"
        "{ip                 |0.0.0.0             | server ip address }"
        "{port               |8080                | server port }"
        "{mode               |0                   | mode 0 cpu, mode 1 gpu }"
        "{path               |/Users/load/code/python/infinivision/tvm-convert/tvm-model | local_id config file }"
        "{cpu-family         |skylake             | cpu architect family name }"
        "{shape              |160,160             | detector model shape }"
        "{index              |0                   | cpu mode: server instance index for cpu binding; gpu mode: gpu card }"
        "{cpu-count          |4                   | core count for cpu binding }"
        "{bind-latency       |3                   | latency for cpu binding }"
    ;
    cv::CommandLineParser parser(argc, argv, keys);
    parser.about("tvm model infer server");
    if (parser.has("help")) {
        parser.printMessage();
        return 0;
    }

    // create model handler
    std::string path = parser.get<cv::String>("path");
    int mode         = parser.get<int>("mode");
    int index        = parser.get<int>("index");
    int cpu_count    = parser.get<int>("cpu-count");
    if(mode==0){
        char env_omp_num_threads[4];
        int omp_num_threads = cpu_count;
        snprintf(env_omp_num_threads,4,"%d",omp_num_threads);
        if(setenv("OMP_NUM_THREADS",env_omp_num_threads,1)!=0){
            std::cout << "set env OMP_NUM_THREADS error no: " << errno << "\n";
            perror("");
            exit(1);
        }
    }
    std::string cpu_family  = parser.get<cv::String>("cpu-family");
    std::string model_shape  = parser.get<cv::String>("shape");
    std::string str1 = model_shape.substr(0, model_shape.find(","));
    std::string str2 = model_shape.substr(model_shape.find(",")+1, model_shape.length());
    int width  = atoi(str1.c_str());
    int height = atoi(str2.c_str());
    if(mode==0){
        det      = new tvm_mneti (path, "mneti", cpu_family, width, height,1,mode,index);
        embeding = new tvm_r100  (path, "r100",  cpu_family, 112, 112, 1, mode, index);
        gender   = new tvm_gender(path, "gender_slim",cpu_family, 112, 112, 1, mode, index);
        age      = new tvm_age   (path, "age_slim",   cpu_family, 112, 112, 1, mode, index);
    } else if (mode==1) {
        det      = new tvm_mneti (path, "mneti", "nvidia", width, height, 1, mode, index);
        embeding = new tvm_r100  (path, "r100",  "nvidia", 112, 112, 1, mode, index);
        gender   = new tvm_gender(path, "gender_slim","nvidia", 112, 112, 1, mode, index);
        age      = new tvm_age   (path, "age_slim",   "nvidia", 112, 112, 1, mode, index);
    }

    std::string config  = parser.get<cv::String>("config");
    read_conf(config);    
    // do cpu binding
    #ifdef CPU_BINDING
    if(mode==0){
        int bind_latency   = parser.get<int>("bind-latency");
        std::this_thread::sleep_for(std::chrono::seconds(bind_latency));
        int cpu_min = index * cpu_count;
        int cpu_max = (index + 1) * cpu_count - 1;
        int pid = getpid();
        std::string taskset_cmd = "taskset -cap " 
                                + std::to_string(cpu_min) + "-" 
                                + std::to_string(cpu_max) + " " 
                                + std::to_string(pid);
        std::cout << taskset_cmd << "\n";
        system(taskset_cmd.c_str());
    }

    #endif
    // run http server
    std::string ip   = parser.get<cv::String>("ip");
    std::string port = parser.get<cv::String>("port");
    try {
        tvm_svc handler;
        server::options options(handler);
        server server_(options.address(ip.c_str()).port(port.c_str()));
        server_.run();
    }
    catch (std::exception &e) {
        std::cerr << e.what() << std::endl;
        return 1;
    }

    return 0;
}