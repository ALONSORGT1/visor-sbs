import { estimateVerticalAlignment } from './assistance.js';

self.onmessage = ({ data }) => {
  const { grayLeft, grayRight, width, height } = data;
  self.postMessage(estimateVerticalAlignment(grayLeft, grayRight, width, height));
};
