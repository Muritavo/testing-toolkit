contract AnotherContract {
    event ExampleEvent(string ExampleMsg);
    function echo(uint _value) public view returns (uint) {
        return _value * 1000000;
    }
    function echoSend(uint _value) external {
        emit ExampleEvent('This is a Example');
    }
}
