let io;

function setIO(socketIO) {
  io = socketIO;
}

function emitNewComment(postId, comment) {
  if (io) {
    // Convert mongoose document to plain object, handling populated fields
    const commentData = comment.toJSON ? comment.toJSON() : comment;
    io.to(`post_${postId}`).emit('new_comment', commentData);
    console.log(`📤 Emitted new comment to post_${postId}`);
  }
}

module.exports = {
  setIO,
  emitNewComment
};