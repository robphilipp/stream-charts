export interface TrackerStyle {
    visible: boolean;
    timeWindow: number;
    magnification: number;
    color: string,
    lineWidth: number,
}

export const defaultTrackerStyle: TrackerStyle = {
    visible: false,
    timeWindow: 50,
    magnification: 1,
    color: '#d2933f',
    lineWidth: 2,
};
