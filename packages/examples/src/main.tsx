import './styles/index.css'
import {WindowDimensionsProvider} from "react-resizable-grid-layout"
import {createRoot} from "react-dom/client"
import {StrictMode} from "react";
import {RouterProvider} from "@tanstack/react-router";
import {router} from "./app/router";

const domNode = document.getElementById('root')
const root = createRoot(domNode!)

root.render(
    <StrictMode>
        <WindowDimensionsProvider>
            <RouterProvider router={router}/>
        </WindowDimensionsProvider>
    </StrictMode>
)
