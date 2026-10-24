import {create} from 'zustand'

interface IntroStore {
    /**
     * The intro page the user was last on, so that the Intro tab can bring them back to it (the
     * page itself lives in the URL, as `/intro?page=N`, which is lost when they go to another tab)
     */
    page: number
    setPage: (page: number) => void
}

/**
 * Store for remembering the intro page the user was last on
 */
export const useIntroStore = create<IntroStore>()(
    set => ({
        page: 0,
        setPage: (page: number) => set({page})
    })
)
