import Foundation
import Darwin
guard CommandLine.arguments.count == 2, getuid() > 0 else {exit(1)}
let fd=open(CommandLine.arguments[1],O_CREAT | O_RDWR | O_NOFOLLOW,S_IRUSR | S_IWUSR)
var info=stat()
guard fd>=0, fstat(fd,&info)==0, info.st_uid==getuid(), info.st_mode & 0o077 == 0,
      info.st_mode & mode_t(S_IFMT) == mode_t(S_IFREG), info.st_nlink == 1,
      flock(fd,LOCK_EX | LOCK_NB)==0 else {exit(1)}
print("locked");fflush(stdout)
// Parent owns the write end; crash, logout or normal shutdown releases flock.
_ = FileHandle.standardInput.readDataToEndOfFile()
close(fd)
