contract SimpleContract {
    event TestEvent(string testMsg);
    function echo(uint _value) public view returns (uint) {
        return _value;
    }
    function echoSend(uint _value) external {
        emit TestEvent('This is a test');
    }
}
