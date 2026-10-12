#include <QGuiApplication>
#include <QTimer>
#include <KIdleTime>
#include <cstdio>
#include <unistd.h>
int main(int argc, char **argv) {
    QGuiApplication app(argc, argv);
    auto idle = KIdleTime::instance();
    // Wayland does not support idleTime() polling. Exclude unknown startup
    // time until the compositor provides a real idle or resume notification.
    const char *state = "unknown";
    QObject::connect(idle, &KIdleTime::timeoutReached, &app, [&](int, int) {state="idle";});
    QObject::connect(idle, &KIdleTime::resumingFromIdle, &app, [&]() {
        state="active";
        QTimer::singleShot(0, idle, &KIdleTime::catchNextResumeEvent);
    });
    idle->addIdleTimeout(60000);
    idle->catchNextResumeEvent();
    QTimer timer;
    QObject::connect(&timer, &QTimer::timeout, &app, [&]() {
        if (getppid()==1) app.quit();
        std::puts(state); std::fflush(stdout);
    });
    timer.start(1000);
    return app.exec();
}
