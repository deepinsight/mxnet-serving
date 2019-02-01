#include <face_align.h>
#include <iostream>

using namespace std;

FaceAlign::FaceAlign() {
  align_src_.push_back(cv::Point2f(38.2946, 51.6963));
  align_src_.push_back(cv::Point2f(73.5318, 51.5014));
  align_src_.push_back(cv::Point2f(56.0252, 71.7366));
  align_src_.push_back(cv::Point2f(41.5493, 92.3655));
  align_src_.push_back(cv::Point2f(70.7299, 92.2041));

  size = cv::Size(112,112);
}

cv::Mat points2mat(const vector<cv::Point2f> &points) {
  cv::Mat output(points.size(), 2, CV_32F);

  for (int i = 0; i < points.size(); ++i)
  {
    cv::Point2f p = points[i];
    output.at<float>(i, 0) = p.x;
    output.at<float>(i, 1) = p.y;
  }

  return output;
}

cv::Mat meanAxis0(const cv::Mat &src)
{
    int num = src.rows;
    int dim = src.cols;

    cv::Mat output(1,dim,CV_32F);
    for(int i = 0 ; i <  dim; i ++)
    {
        float sum = 0 ;
        for(int j = 0 ; j < num ; j++)
        {
            sum+=src.at<float>(j,i);
        }
        output.at<float>(0,i) = sum/num;
    }

    return output;
}

cv::Mat elementwiseMinus(const cv::Mat &A,const cv::Mat &B)
{
    cv::Mat output(A.rows,A.cols,A.type());

    assert(B.cols == A.cols);
    if(B.cols == A.cols)
    {
        for(int i = 0 ; i <  A.rows; i ++)
        {
            for(int j = 0 ; j < B.cols; j++)
            {
                output.at<float>(i,j) = A.at<float>(i,j) - B.at<float>(0,j);
            }
        }
    }
    return output;
}

cv::Mat varAxis0(const cv::Mat &src)
{
    cv::Mat temp_ = elementwiseMinus(src,meanAxis0(src));
    cv::multiply(temp_ ,temp_ ,temp_ );
    return meanAxis0(temp_);

}

int MatrixRank(cv::Mat M)
{
    cv::Mat w, u, vt;
    cv::SVD::compute(M, w, u, vt);
    cv::Mat1b nonZeroSingularValues = w > 0.0001;
    int rank = countNonZero(nonZeroSingularValues);
    return rank;

}
//    References
//    ----------
//    .. [1] "Least-squares estimation of transformation parameters between two
//    point patterns", Shinji Umeyama, PAMI 1991, DOI: 10.1109/34.88573
//
//    """
//
//    Anthor:Jack Yu

cv::Mat similarTransform(cv::Mat src,cv::Mat dst) {
    int num = src.rows;
    int dim = src.cols;
    cv::Mat src_mean = meanAxis0(src);
    cv::Mat dst_mean = meanAxis0(dst);
    cv::Mat src_demean = elementwiseMinus(src, src_mean);
    cv::Mat dst_demean = elementwiseMinus(dst, dst_mean);
    cv::Mat A = (dst_demean.t() * src_demean) / static_cast<float>(num);
    cv::Mat d(dim, 1, CV_32F);
    d.setTo(1.0f);
    if (cv::determinant(A) < 0) {
        d.at<float>(dim - 1, 0) = -1;

    }
    cv::Mat T = cv::Mat::eye(dim + 1, dim + 1, CV_32F);
    cv::Mat U, S, V;
    cv::SVD::compute(A, S,U, V);

    // the SVD function in opencv differ from scipy .

    int rank = MatrixRank(A);
    if (rank == 0) {
        assert(rank == 0);

    } else if (rank == dim - 1) {
        if (cv::determinant(U) * cv::determinant(V) > 0) {
            T.rowRange(0, dim).colRange(0, dim) = U * V;
        } else {
//            s = d[dim - 1]
//            d[dim - 1] = -1
//            T[:dim, :dim] = np.dot(U, np.dot(np.diag(d), V))
//            d[dim - 1] = s
            int s = d.at<float>(dim - 1, 0) = -1;
            d.at<float>(dim - 1, 0) = -1;

            T.rowRange(0, dim).colRange(0, dim) = U * V;
            cv::Mat diag_ = cv::Mat::diag(d);
            cv::Mat twp = diag_*V; //np.dot(np.diag(d), V.T)
            cv::Mat B = cv::Mat::zeros(3, 3, CV_8UC1);
            cv::Mat C = B.diag(0);
            T.rowRange(0, dim).colRange(0, dim) = U* twp;
            d.at<float>(dim - 1, 0) = s;
        }
    }
    else{
        cv::Mat diag_ = cv::Mat::diag(d);
        cv::Mat twp = diag_*V.t(); //np.dot(np.diag(d), V.T)
        cv::Mat res = U* twp; // U
        T.rowRange(0, dim).colRange(0, dim) = -U.t()* twp;
    }
    cv::Mat var_ = varAxis0(src_demean);
    float val = cv::sum(var_).val[0];
    cv::Mat res;
    cv::multiply(d,S,res);
    float scale =  1.0/val*cv::sum(res).val[0];
    T.rowRange(0, dim).colRange(0, dim) = - T.rowRange(0, dim).colRange(0, dim).t();
    cv::Mat  temp1 = T.rowRange(0, dim).colRange(0, dim); // T[:dim, :dim]
    cv::Mat  temp2 = src_mean.t(); //src_mean.T
    cv::Mat  temp3 = temp1*temp2; // np.dot(T[:dim, :dim], src_mean.T)
    cv::Mat temp4 = scale*temp3;
    T.rowRange(0, dim).colRange(dim, dim+1)=  -(temp4 - dst_mean.t()) ;
    T.rowRange(0, dim).colRange(0, dim) *= scale;
    return T;
}
/*
 * Align face
 */
cv::Mat FaceAlign::Align(const cv::Mat& input, const std::vector<cv::Point2f>& align_dst) {

  cv::Mat warped;

  // for (int i = 0; i < align_dst.size(); ++i){
  //   cout << align_dst[i] << endl;
  // }

  // cout << "\testimate rigid transform ...";
  // cv::Mat R = cv::estimateRigidTransform(align_dst,align_src_,false);
  cv::Mat src = points2mat(align_src_);
  cv::Mat des = points2mat(align_dst);
  cv::Mat R = similarTransform(des, src);
  // std::cout << " R size: " << R.size << endl;

  if (R.empty()) {
    std::cout << "failed to find similar transform matrix for face alignment";
    return warped;
  }
  // cv::warpAffine(input, warped, R, size);
  cv::Mat H =  R.rowRange(0, 2);
  /*
  cv::Mat H = cv::Mat(2,3,R.type());
  H.at<float>(0,0) = R.at<float>(0,0);
  H.at<float>(0,1) = R.at<float>(0,1);
  H.at<float>(0,2) = R.at<float>(0,2);

  H.at<float>(1,0) = R.at<float>(1,0);
  H.at<float>(1,1) = R.at<float>(1,1);
  H.at<float>(1,2) = R.at<float>(1,2);
  */
  // cout << R << endl;
  // R is now a matrix of size 2 * 3
  cv::warpAffine(input, warped, H, size);
  // cv::warpPerspective(input,warped,H,size);
  // cout << " end" << endl;
  return warped;
}
