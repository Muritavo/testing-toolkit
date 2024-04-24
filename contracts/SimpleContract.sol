contract SimpleContract {
    function echo(uint _value) public view returns (uint) {
        return _value;
    }
    function echoSend(uint _value) external {}
}
