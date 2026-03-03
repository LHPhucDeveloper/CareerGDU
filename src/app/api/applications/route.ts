import { NextResponse } from "next/server"
import { getCollection, COLLECTIONS } from "@/database/connection"
import { sendEmail } from "@/services/email.service"
import { ObjectId } from "mongodb"
import { checkNotificationPreference } from "@/lib/notification-utils"
<<<<<<< HEAD
=======
import { saveBase64Image } from "@/lib/storage"
>>>>>>> a0283d5 (pre-merge save)

export async function POST(request: Request) {
  try {
    const formData = await request.formData()

    // Extract text fields
    const jobTitle = formData.get("jobTitle") as string
    const companyName = formData.get("companyName") as string
    const jobId = formData.get("jobId") as string
    let employerId = formData.get("employerId") as string
    // Student Info
    const fullname = formData.get("fullname") as string
    const email = formData.get("email") as string
    const phone = formData.get("phone") as string
    const mssv = formData.get("mssv") as string
    const major = formData.get("major") as string
    const faculty = formData.get("faculty") as string
    const cohort = formData.get("cohort") as string

    const message = formData.get("message") as string
    const applicantId = formData.get("applicantId") as string // User ID for notifications

    // Verify applicant still exists if logged in
    if (applicantId && ObjectId.isValid(applicantId)) {
      const usersCollection = await getCollection(COLLECTIONS.USERS)
      const userExists = await usersCollection.findOne({ _id: new ObjectId(applicantId) })
      if (!userExists) {
        return NextResponse.json({ error: "Tài khoản của bạn không tồn tại hoặc đã bị xóa. Vui lòng đăng xuất và đăng ký lại." }, { status: 401 })
      }
      if (userExists.role === "employer" || userExists.role === "admin") {
        return NextResponse.json({ error: "Nhà tuyển dụng hoặc quản trị viên không thể ứng tuyển công việc." }, { status: 403 })
      }
    }

    console.log("[Applications API] POST - jobId:", jobId, "employerId from form:", employerId, "applicantId:", applicantId)

    // Always lookup job if jobId provided for security and deadline validation
    if (jobId) {
      try {
        const jobsCollection = await getCollection(COLLECTIONS.JOBS)
        let job = null
        try {
          if (ObjectId.isValid(jobId)) {
            job = await jobsCollection.findOne({ _id: new ObjectId(jobId) })
          }
        } catch (e) {
          console.error("[Applications API] Invalid ObjectId:", jobId)
        }

        if (!job) {
          job = await jobsCollection.findOne({ _id: jobId as any })
        }

        if (job) {
          // 1. Sync employerId
          if (job.creatorId) {
            employerId = job.creatorId
            console.log("[Applications API] Found/Verified employerId from job:", employerId)
          }

          // 2. Strict Deadline validation
          if (job.deadline) {
            const parseDateHelper = (dateVal: any): number => {
              if (!dateVal) return 0
              try {
                if (dateVal instanceof Date) return dateVal.getTime()
                if (typeof dateVal === 'string') {
                  if (dateVal.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
                    const [day, month, year] = dateVal.split('/').map(Number)
                    return new Date(year, month - 1, day).getTime()
                  }
                  const date = new Date(dateVal)
                  return isNaN(date.getTime()) ? 0 : date.getTime()
                }
                const date = new Date(dateVal)
                return isNaN(date.getTime()) ? 0 : date.getTime()
              } catch {
                return 0
              }
            }

            const timeDeadline = parseDateHelper(job.deadline)
            // Adjust to end of day if it's DD/MM/YYYY (optional, but keep it consistent for now)
            // For now, simple check is enough as per front-end
            if (timeDeadline > 0 && timeDeadline < new Date().getTime()) {
              return NextResponse.json({ error: "Công việc này đã hết hạn nhận hồ sơ." }, { status: 403 })
            }
          }

          // 3. Optional: Check if job is full (quantity vs hiredCount)
          // This would require another lookup for hiredCount, but let's stick to deadline for now.
        }
      } catch (lookupError) {
        console.error("[Applications API] Error looking up job:", lookupError)
      }
    }

    // Extract file
    const file = formData.get("cv") as File | null

    // Validate required fields (file is now optional)
    if (!fullname || !email || !phone || !mssv || !major) {
      return NextResponse.json({ error: "Thiếu thông tin bắt buộc" }, { status: 400 })
    }

    // Server-side strict phone validation
    const cleanPhone = phone.replace(/\D/g, '')
    if (!cleanPhone.startsWith('0') || cleanPhone.length < 10 || cleanPhone.length > 11) {
      return NextResponse.json({ error: "Số điện thoại không hợp lệ. Phải bắt đầu bằng số 0 và có 10-11 chữ số." }, { status: 400 })
    }

    let cvDataUrl = null
    let cvOriginalName = null
    let cvMimeType = null

    // Process file only if it exists
    if (file && file.size > 0 && typeof file.arrayBuffer === 'function') {
      // Validate file type
      const validTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
      if (!validTypes.includes(file.type)) {
        return NextResponse.json({ error: "Loại file không hợp lệ" }, { status: 400 })
      }

      // Validate file size (20MB)
      if (file.size > 20 * 1024 * 1024) {
        return NextResponse.json({ error: "File quá lớn (>20MB)" }, { status: 400 })
      }

      // Convert CV to Base64
      const bytes = await file.arrayBuffer()
      const buffer = Buffer.from(bytes)
      const cvBase64 = buffer.toString("base64")
      cvDataUrl = `data:${file.type};base64,${cvBase64}`
      cvOriginalName = file.name
      cvMimeType = file.type
    }

    const applicationsCollection = await getCollection(COLLECTIONS.APPLICATIONS)

<<<<<<< HEAD
=======
    // Tối ưu: Lưu tệp CV vào Local Storage thay vì Base64 trong MongoDB
    let cvPath = null
    if (cvDataUrl) {
      cvPath = await saveBase64Image(cvDataUrl, "cvs")
    }

>>>>>>> a0283d5 (pre-merge save)
    const applicationData = {
      jobId,
      jobTitle,
      companyName,
      employerId: employerId || null,
      applicantId: applicantId || null,
      fullname,
      email,
      phone,
      mssv,
      major,
      faculty,
      cohort,
      message,
<<<<<<< HEAD
      cvBase64: cvDataUrl,
=======
      cvBase64: cvPath, // Lưu đường dẫn tệp (ví dụ: /uploads/cvs/...)
>>>>>>> a0283d5 (pre-merge save)
      cvOriginalName: cvOriginalName,
      cvMimeType: cvMimeType,
      createdAt: new Date(),
      status: "new",
    }

    const result = await applicationsCollection.insertOne(applicationData)
    const applicationId = result.insertedId.toString()

    // Increment applicants count on the job
    if (jobId) {
      try {
        const jobsCollection = await getCollection(COLLECTIONS.JOBS)
        // Try ObjectId first, then string
        try {
          await jobsCollection.updateOne(
            { _id: new ObjectId(jobId) },
            { $inc: { applicants: 1 } }
          )
        } catch {
          await jobsCollection.updateOne(
            { _id: jobId as any },
            { $inc: { applicants: 1 } }
          )
        }
        console.log("[Applications API] Incremented applicants count for job:", jobId)
      } catch (incError) {
        console.error("[Applications API] Failed to increment applicants count:", incError)
      }
    }

    // Create Notifications
    const notificationsCollection = await getCollection(COLLECTIONS.NOTIFICATIONS)

    // 1. Notification for Admin
    try {
      await notificationsCollection.insertOne({
        targetRole: 'admin',
        type: 'job',
        title: 'Hồ sơ ứng tuyển mới',
        message: `${fullname} vừa ứng tuyển vị trí ${jobTitle} tại ${companyName}`,
        read: false,
        createdAt: new Date(),
        link: `/dashboard/applicants-manager?id=${applicationId}`,
        applicationId: applicationId
      })
      console.log("[Applications API] Created admin notification")
    } catch (notifError) {
      console.error("Failed to create admin notification:", notifError)
    }

    // 2. Notification for Employer (if employerId exists)
    // Only send if the applicant is NOT the employer themselves (self-application)
    if (employerId && employerId !== applicantId) {
      try {
        await notificationsCollection.insertOne({
          userId: employerId,
          type: 'job',
          title: 'Ứng viên mới ứng tuyển',
          message: `${fullname} vừa ứng tuyển vị trí ${jobTitle}`,
          read: false,
          createdAt: new Date(),
          link: `/dashboard/applicants-manager?id=${applicationId}`,
          applicationId: applicationId
        })
        console.log("[Applications API] Created employer notification for:", employerId)
      } catch (notifError) {
        console.error("Failed to create employer notification:", notifError)
      }
    } else if (!employerId) {
      // If no employerId (Static/System Job), we don't broadcast to all employers anymore
      // Only the Admin notification (created above) is sufficient for system jobs
      console.log("[Applications API] No employerId found, skipping employer broadcast.")
    }

    // 3. Notification for Student/Applicant (if applicantId exists - logged in user)
    if (applicantId) {
      try {
        await notificationsCollection.insertOne({
          userId: applicantId,
          type: 'job',
          title: 'Ứng tuyển thành công',
          message: `Bạn đã ứng tuyển thành công vào vị trí ${jobTitle} tại ${companyName}. Chúc bạn may mắn!`,
          read: false,
          createdAt: new Date(),
          link: `/dashboard/applications`,
          applicationId: applicationId
        })
        console.log("[Applications API] Created student notification for:", applicantId)
      } catch (notifError) {
        console.error("Failed to create student notification:", notifError)
      }
    }

    // 3. Send Email Notifications
    const host = request.headers.get('host')
    const protocol = host?.includes('localhost') ? 'http' : 'https'
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (host ? `${protocol}://${host}` : 'https://career-web-three.vercel.app')
    const cleanBaseUrl = baseUrl.replace(/\/$/, '')
    const applicationLink = `${cleanBaseUrl}/dashboard/applicants-manager?id=${applicationId}`

    const emailSubject = `[GDU Career] Hồ sơ ứng tuyển mới: ${jobTitle}`
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1e3a5f; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">GDU Career Portal</h1>
        </div>
        <div style="padding: 30px; background: #f9f9f9;">
          <h2 style="color: #1e3a5f;">Có ứng viên mới!</h2>
          <p><strong>Vị trí:</strong> ${jobTitle}</p>
          <p><strong>Công ty:</strong> ${companyName}</p>
          <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;" />
          <h3 style="color: #333;">Thông tin ứng viên:</h3>
          <ul style="list-style: none; padding: 0;">
            <li style="padding: 8px 0;"><strong>Họ tên:</strong> ${fullname}</li>
            <li style="padding: 8px 0;"><strong>Email:</strong> ${email}</li>
            <li style="padding: 8px 0;"><strong>Số điện thoại:</strong> ${phone}</li>
            <li style="padding: 8px 0;"><strong>MSSV:</strong> ${mssv}</li>
            <li style="padding: 8px 0;"><strong>Ngành:</strong> ${major}</li>
            <li style="padding: 8px 0;"><strong>CV:</strong> ${cvOriginalName || 'Không đính kèm'}</li>
            ${message ? `<li style="padding: 8px 0;"><strong>Lời nhắn:</strong> ${message}</li>` : ''}
          </ul>
          <div style="margin-top: 30px; text-align: center;">
            <a href="${applicationLink}" 
               style="background-color: #1e3a5f; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
              Xem hồ sơ chi tiết
            </a>
          </div>
        </div>
        <div style="padding: 15px; text-align: center; color: #666; font-size: 12px;">
          <p>Email này được gửi tự động từ GDU Career Portal</p>
        </div>
      </div>
    `

    // Send email to admin
    try {
      if (process.env.ADMIN_EMAIL) {
        // Look up admin user to check preference
        const usersCollection = await getCollection(COLLECTIONS.USERS)
        const adminUser = await usersCollection.findOne({ email: process.env.ADMIN_EMAIL })
        const shouldSendAdminEmail = await checkNotificationPreference(adminUser?._id, 'email')

        if (shouldSendAdminEmail) {
          await sendEmail({
            to: process.env.ADMIN_EMAIL,
            subject: emailSubject,
            html: emailHtml
          })
          console.log("[Applications API] Admin email sent")
        } else {
          console.log("[Applications API] Admin email skipped (preference off)")
        }
      }
    } catch (emailError) {
      console.error("Failed to send admin email:", emailError)
    }

    // Send email to employer (if we have their email)
    if (employerId) {
      try {
        const usersCollection = await getCollection(COLLECTIONS.USERS)
        const { ObjectId } = await import("mongodb")
        const employer = await usersCollection.findOne({ _id: new ObjectId(employerId) })

        if (employer?.email) {
          const shouldSendEmployerEmail = await checkNotificationPreference(employerId, 'email')

          if (shouldSendEmployerEmail) {
            await sendEmail({
              to: employer.email,
              subject: emailSubject,
              html: emailHtml
            })
            console.log("[Applications API] Employer email sent to:", employer.email)
          } else {
            console.log("[Applications API] Employer email skipped (preference off) for:", employer.email)
          }
        }
      } catch (emailError) {
        console.error("Failed to send employer email:", emailError)
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: "Ứng tuyển thành công",
        applicationId: applicationId
      },
      { status: 200 },
    )
  } catch (error) {
    console.error("Application submission error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const jobId = searchParams.get("jobId")

    // Get session for server-side auth
    const { cookies } = await import("next/headers")
    const { decrypt } = await import("@/lib/session")
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get("session")?.value
    const session = await decrypt(sessionCookie)

    if (!session || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.userId as string
    const userRole = session.role as string

    const collection = await getCollection(COLLECTIONS.APPLICATIONS)
    let query: Record<string, any> = {}
    const queryParts: any[] = []

    if (userRole === "admin") {
      // Admins see everything
    } else if (userRole === "employer") {
      // Employers see applications for their jobs
      queryParts.push({
        $or: [
          { employerId: userId },
          { employerId: new ObjectId(userId) }
        ]
      })
    } else {
      // Students see only their own applications
      // For students, we match by applicantId (preferred) or email (fallback)
      const usersCollection = await getCollection(COLLECTIONS.USERS)
      const currentUser = await usersCollection.findOne({ _id: new ObjectId(userId) })

      if (currentUser) {
        queryParts.push({
          $or: [
            { applicantId: userId },
            { applicantId: new ObjectId(userId) },
            { email: currentUser.email }
          ]
        })
      } else {
        return NextResponse.json({ success: true, data: [] })
      }
    }

    // Add jobId filter if provided
    if (jobId) {
      if (ObjectId.isValid(jobId)) {
        queryParts.push({
          $or: [
            { jobId: jobId },
            { jobId: new ObjectId(jobId) }
          ]
        })
      } else {
        queryParts.push({ jobId: jobId })
      }
    }

    if (queryParts.length === 1) {
      query = queryParts[0]
    } else if (queryParts.length > 1) {
      query = { $and: queryParts }
    }

    // Don't return cvBase64 in list to save bandwidth
    const applications = await collection
      .find(query)
      .project({ cvBase64: 0 })
      .sort({ createdAt: -1 })
      .toArray()

    return NextResponse.json({
      success: true,
      data: applications
    })
  } catch (error) {
    console.error("Fetch applications error:", error)
    return NextResponse.json({ error: "Failed to fetch applications" }, { status: 500 })
  }
}
