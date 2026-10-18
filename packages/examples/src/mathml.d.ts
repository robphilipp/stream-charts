import React from "react";

declare module 'react' {
    namespace JSX {
        interface IntrinsicElements {
            math: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { display?: 'block' | 'inline' };
            mrow: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
            mi: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
            mo: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
            mn: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
            msup: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
            msub: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
            mfrac: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
            msqrt: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
            mroot: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
            mover: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
            mtext: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
            msubsup: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
        }
    }
}
