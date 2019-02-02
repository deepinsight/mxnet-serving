#include "tvm_mneti.h"
#include "anchors.h"
tvm_mneti::tvm_mneti(std::string path, std::string name, std::string hardware, 
            int w, int h, int batch, int mode, int devid):
                    tvm_model(path, name, hardware, w, h, batch, mode, devid), width(w), height(h){
        generate_anchors_fpn(anchors_fpn, num_anchors);
}

void tvm_mneti::detect(cv::Mat& im, std::vector<cv::Rect2f>  & target_boxes,
                        std::vector<cv::Point2f> & target_landmarks,
                        std::vector<float>       & target_scores){

    assert(im.channels() == 3);
    size_t size = im.channels() * im.rows * im.cols;
    std::vector<float> image_data(size);
    float* ptr_image_r = image_data.data();
    float* ptr_image_g = image_data.data() + size / 3;
    float* ptr_image_b = image_data.data() + size / 3 * 2;
    for (int i = 0; i < im.rows; i++) {
        auto data = im.ptr<uchar>(i);

        for (int j = 0; j < im.cols; j++) {
            *ptr_image_b = static_cast<float>(((*data)/pixel_scale - pixel_means[0]) / pixel_stds[0]);
            ptr_image_b++;
            data++;
            *ptr_image_g = static_cast<float>(((*data)/pixel_scale - pixel_means[1]) / pixel_stds[1]);
            ptr_image_g++;
            data++;
            *ptr_image_r = static_cast<float>(((*data)/pixel_scale - pixel_means[2]) / pixel_stds[2]);
            ptr_image_r++;
            data++;
        }
    }
    memcpy(infer_buff->data, &image_data[0], sizeof(image_data[0]) * image_data.size());
    tvm::runtime::PackedFunc set_input = handle->GetFunction("set_input");
    set_input("data", infer_buff.get());
    tvm::runtime::PackedFunc run = handle->GetFunction("run");
    run();
    get_output = handle->GetFunction("get_output");

    std::vector<float> scores;
    std::vector<cv::Rect2f> boxes;
    std::vector<cv::Point2f> landmarks;
    for (int index = 0; index < 3; ++index)
    {
        std::vector<int> shape;
        std::vector<float> scores1;
        tvmOutputOfIndex(get_output, scores1, shape, index * 3);
        /*
        std::cout << "output shape len: " << shape.size() << "\n";
        for(auto s: shape)
            std::cout << "output shape1: " << s << "\n";
        */
        int hscore = shape[2];
        int wscore = shape[3];
        std::vector<float> scores2;
        int count = scores1.size()/2;
        scores2.resize(count);
        for(size_t i = 0; i < scores2.size(); i++)
        {
            scores2[i] = scores1[i + count];
        }
        std::vector<float> scores3;
        tensor_reshape(scores2, scores3, hscore, wscore, 1);
        std::vector<float> bbox_deltas;
        tvmOutputOfIndex(get_output, bbox_deltas, shape, index * 3 + 1);
        int h = shape[2];
        int w = shape[3];
        int c = 1;
        if (shape.size() >= 5)
        {
            c = shape[4];
        }
        int stride = stride_fpn[index];
        std::vector<cv::Rect2f> anchors;
        anchor_plane(h,w, stride, anchors_fpn[stride], anchors);
        /*
        std::cout << "output shape len: " << shape.size() << "\n";
        for(auto s: shape)
            std::cout << "output shape2: " << s << "\n";
        */
        std::vector<cv::Rect2f> boxes1;
        bbox_pred(anchors, boxes1, bbox_deltas, h, w, c);
        clip_boxes(boxes1, im.rows, im.cols);

        std::vector<float> landmark_deltas;
        tvmOutputOfIndex(get_output, landmark_deltas, shape, index * 3 + 2);
        c = 1;
        if (shape.size() >= 5)
        {
            c = shape[4];
        }
        /*
        std::cout << "output shape len: " << shape.size() << "\n";
        for(auto s: shape)
            std::cout << "output shape3: " << s << "\n";
        */

        std::vector<cv::Point2f> landmarks1;
        landmark_pred(anchors, landmarks1, landmark_deltas, h, w, c);
        std::vector<bool> idx;
        filter_threshold(idx, scores3, threshold);
        std::vector<float> scores4;
        tensor_slice(scores3, scores4, idx, 1);
        scores.insert(scores.end(), scores4.begin(), scores4.end());
        std::vector<cv::Rect2f> boxes2;
        tensor_slice(boxes1, boxes2, idx, 1);
        boxes.insert(boxes.end(), boxes2.begin(), boxes2.end());
        std::vector<cv::Point2f> landmarks2;
        tensor_slice(landmarks1, landmarks2, idx, 5);
        landmarks.insert(landmarks.end(), landmarks2.begin(), landmarks2.end());
    }

    std::vector<int> order;
    argsort(order, scores);
    std::vector<float> order_scores;
    std::vector<cv::Rect2f> order_boxes;
    std::vector<cv::Point2f> order_landmarks;
    sort_with_idx(scores, order_scores, order, 1);
    sort_with_idx(boxes,  order_boxes, order, 1);
    sort_with_idx(landmarks, order_landmarks, order, 5);
    std::vector<bool> keep(order_scores.size(),false);
    nms(order_scores, order_boxes, keep, nms_threshold);
    tensor_slice(order_boxes,     target_boxes,     keep, 1);
    tensor_slice(order_landmarks, target_landmarks, keep, 5);
    tensor_slice(order_scores,    target_scores,    keep, 1);

}