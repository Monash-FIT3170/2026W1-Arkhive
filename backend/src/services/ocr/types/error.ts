class NotATableError extends Error{
  constructor(message: string) {
    super(message);
    // Explicitly set the name to match the class name
    this.name = "NotATableError"; 
  }
}