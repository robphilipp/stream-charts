export interface Theme {
    name: 'dark' | 'light'
    color: string
    backgroundColor: string
    disabledColor: string
    disabledBackgroundColor: string
}

export const darkTheme: Theme = {
    name: 'dark',
    color: '#bcbcb7',
    backgroundColor: '#100f0c',
    disabledColor: '#777676',
    disabledBackgroundColor: '#3e3d3d'
}

export const lightTheme: Theme = {
    name: 'light',
    color: '#100f0c',
    backgroundColor: '#fdfcfc',
    disabledColor: '#989797',
    disabledBackgroundColor: '#cccaca'
}