package io.hmg.familydiary.platform

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import java.util.concurrent.Executors

/** Finite outgoing work only: no SSE subscription, periodic job, wake lock, or media access from UI. */
class SyncUploadJob : JobService() {
    override fun onStartJob(params: JobParameters): Boolean {
        SyncUploads.request(this, fromJob=true, done = { jobFinished(params, false) })
        return true
    }
    override fun onStopJob(params: JobParameters): Boolean {
        CloudSync.get(filesDir).cancel()
        return true
    }
}

object SyncUploads {
    private const val JOB_ID = 2301
    private var installed=false
    @Synchronized fun install(context:Context) {
        if(installed)return
        val app=context.applicationContext
        app.getSystemService(android.net.ConnectivityManager::class.java).registerDefaultNetworkCallback(object:android.net.ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network:android.net.Network) {
                val sync=CloudSync.get(app.filesDir)
                if(sync.paired && sync.retryDelay()!=null){sync.retryNow();request(app,sync)}
            }
        })
        installed=true
    }
    private val executor = Executors.newSingleThreadExecutor { r -> Thread(r,"diary-outbox") }
    fun schedule(context:Context, delay:Long) {
        context.getSystemService(JobScheduler::class.java).schedule(JobInfo.Builder(JOB_ID,ComponentName(context,SyncUploadJob::class.java))
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setMinimumLatency(delay.coerceAtLeast(1000))
            .setBackoffCriteria(30000,JobInfo.BACKOFF_POLICY_EXPONENTIAL).setPersisted(true).build())
    }
    fun request(context:Context, sync:CloudSync=CloudSync.get(context.filesDir), fromJob:Boolean=false, done:()->Unit={}) {
        val app=context.applicationContext
        // Persist a recovery opportunity before dispatch. Never start recording/playback from this job.
        val production=sync===CloudSync.get(app.filesDir)
        if(!fromJob && production && sync.paired)schedule(app,30000)
        executor.execute {
            var failed=false
            try { sync.flush() } catch(_:Exception) { failed=true }
            finally {
                done()
                if(production) {
                    val delay=sync.retryDelay() ?: if(failed && sync.paired)60000L else null
                    if(delay!=null)schedule(app,delay)
                    else app.getSystemService(JobScheduler::class.java).cancel(JOB_ID)
                }
            }
        }
    }
}
