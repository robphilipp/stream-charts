# streamable charts

Please see [change history](changes.md) for a history of changes.

## intro

Charts for viewing high frequency data in real-time. The charts below show charts after the data has been streamed.

The first chart is a neuron raster chart that displays neuron spikes as a function of time. In the image below, a magnifier lens is used to enlarge a region of the data to compare spikes from different neurons.

![raster-chart](docs/images/raster-magnifier.png)

In this image, the weights are plotted as a function of time, and the tooltip shows the weight updates that came just before the mouse cursor and just after, as well as the time and weight changes.

![scatter-chart](docs/images/scatter.png)  

In both cases the plots were updated in real-time with an average update time interval of 25 ms. 

##

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).