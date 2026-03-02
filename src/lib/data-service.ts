import { getCollection, COLLECTIONS } from "../database/connection"

export async function getHeroSlides(page: string = "home") {
    try {
        const collection = await getCollection(COLLECTIONS.HERO_SLIDES)
        let query: any = { isActive: true }
        if (page !== "all") {
            query.page = page
        }
        const slides = await collection.find(query).sort({ order: 1, createdAt: -1 }).toArray()
        return slides.map(s => ({ ...s, _id: s._id.toString() }))
    } catch (error) {
        console.error(`Error fetching hero slides for ${page}:`, error)
        return []
    }
}

export async function getLatestJobs(limit: number = 4) {
    try {
        const now = new Date()
        const startOfToday = new Date(now.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }) + 'T00:00:00+07:00')

        const collection = await getCollection(COLLECTIONS.JOBS)
        const jobs = await collection.aggregate([
            {
                $addFields: {
                    normalizedDeadline: {
                        $cond: {
                            if: { $eq: [{ $type: "$deadline" }, "date"] },
                            then: "$deadline",
                            else: {
                                $cond: {
                                    if: { $regexMatch: { input: { $ifNull: ["$deadline", ""] }, regex: /^\s*\d{2}\/\d{2}\/\d{4}\s*$/ } },
                                    then: {
                                        $dateFromString: {
                                            dateString: { $trim: { input: "$deadline" } },
                                            format: "%d/%m/%Y",
                                            timezone: "Asia/Ho_Chi_Minh"
                                        }
                                    },
                                    else: {
                                        $cond: {
                                            if: { $regexMatch: { input: { $ifNull: ["$deadline", ""] }, regex: /^\s*\d{4}-\d{2}-\d{2}\s*$/ } },
                                            then: {
                                                $dateFromString: {
                                                    dateString: { $trim: { input: "$deadline" } },
                                                    format: "%Y-%m-%d",
                                                    timezone: "Asia/Ho_Chi_Minh"
                                                }
                                            },
                                            else: null
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            {
                $match: {
                    status: "active",
                    $or: [
                        { normalizedDeadline: { $gte: startOfToday } },
                        { deadline: { $in: [null, "", "Vô thời hạn"] } },
                        { normalizedDeadline: { $exists: false } }
                    ]
                }
            },
            {
                $lookup: {
                    from: COLLECTIONS.APPLICATIONS,
                    let: { jobId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$jobId", "$$jobId"] },
                                        { $eq: ["$status", "hired"] }
                                    ]
                                }
                            }
                        }
                    ],
                    as: "hiredApplications"
                }
            },
            {
                $addFields: {
                    hiredCount: { $size: "$hiredApplications" }
                }
            },
            {
                $match: {
                    $expr: {
                        $or: [
                            { $eq: ["$quantity", -1] },
                            { $lt: ["$hiredCount", { $ifNull: ["$quantity", 1] }] }
                        ]
                    }
                }
            },
            {
                $sort: { postedAt: -1 }
            },
            {
                $limit: limit
            },
            {
                $project: {
                    hiredApplications: 0
                }
            }
        ]).toArray()

        return jobs.map(j => ({ ...j, _id: j._id.toString() }))
    } catch (error) {
        console.error("Error fetching latest jobs:", error)
        return []
    }
}

export async function getSiteConfig(key: string) {
    try {
        const collection = await getCollection(COLLECTIONS.SITE_CONFIGS)
        const config = await collection.findOne({ key })
        return config ? { ...config, _id: config._id.toString() } : null
    } catch (error) {
        console.error(`Error fetching site config for ${key}:`, error)
        return null
    }
}
