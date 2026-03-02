import { getCollection, COLLECTIONS } from "../database/connection"
import { ObjectId } from "mongodb"

export type NotificationType = 'email' | 'push' | 'newJobs'

/**
 * Checks if a user has enabled a specific notification type.
 * Defaults to true for email and newJobs, false for push if not set.
 */
export async function checkNotificationPreference(
    userId: string | ObjectId | null | undefined,
    type: NotificationType
): Promise<boolean> {
    if (!userId) return true // Default to true if no user associated (e.g. system alerts)

    try {
        const usersCollection = await getCollection(COLLECTIONS.USERS)
        const user = await usersCollection.findOne({
            _id: typeof userId === 'string' ? new ObjectId(userId) : userId
        })

        if (!user || !user.notificationSettings) {
            // Default settings if none exist
            if (type === 'push') return false
            return true
        }

        return user.notificationSettings[type] ?? (type === 'push' ? false : true)
    } catch (error) {
        console.error(`Error checking notification preference for ${userId}:`, error)
        return true // Default to sending if check fails to ensure critical info isn't lost
    }
}
