import upstream from '../../../upstream.json'

export const commit: string = upstream.commit
export const repository: string = upstream.repository
export const blob = `https://github.com/${upstream.repository}/blob/${upstream.commit}`
