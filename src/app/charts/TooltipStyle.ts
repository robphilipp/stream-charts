/**
 * Properties for rendering the tooltip
 */
export interface TooltipStyle {
    visible: boolean;

    fontSize: number;
    fontColor: string;
    fontFamily: string;
    fontWeight: number;

    backgroundColor: string;
    backgroundOpacity: number;

    borderColor: string;
    borderWidth: number;
    borderRadius: number;

    paddingLeft: number;
    paddingRight: number;
    paddingTop: number;
    paddingBottom: number;
}

export const defaultTooltipStyle: TooltipStyle = {
    visible: false,

    fontSize: 12,
    fontColor: '#d2933f',
    fontFamily: 'sans-serif',
    fontWeight: 250,

    backgroundColor: '#202020',
    backgroundOpacity: 0.8,

    borderColor: '#d2933f',
    borderWidth: 1,
    borderRadius: 5,

    paddingLeft: 10,
    paddingRight: 10,
    paddingTop: 5,
    paddingBottom: 10,
};
