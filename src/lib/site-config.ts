import { getCollection, COLLECTIONS } from "../database/connection"

export async function getSiteConfig(key: string) {
    try {
        const collection = await getCollection(COLLECTIONS.SITE_CONFIGS)
        const config = await collection.findOne({ key, isActive: true })
        if (config) {
            return JSON.parse(JSON.stringify({ ...config, _id: config._id.toString() }))
        }
        return null
    } catch (error) {
        console.error(`Error getting site config for ${key}:`, error)
        return null
    }
}

export async function getAllSiteConfigs() {
    try {
        const collection = await getCollection(COLLECTIONS.SITE_CONFIGS)
        const configs = await collection.find({ isActive: true }).toArray()
        return JSON.parse(JSON.stringify(configs.map(c => ({ ...c, _id: c._id.toString() }))))
    } catch (error) {
        console.error("Error getting all site configs:", error)
        return []
    }
}
